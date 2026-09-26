#!/usr/bin/env bash
#
# Ensayo de RESTORE local del ERP (P-17 · B19). Todo sintético y efímero; no toca ninguna base
# desplegada ni otro contenedor que el suyo.
#
#   yarn build && yarn ops:restore-drill
#   PG_CONTAINER=mi-pg PG_PORT=55112 yarn ops:restore-drill
#
# Recorrido:
#   1. Base ORIGEN recién migrada (`db:migrate:prod`, el migrador del despliegue).
#   2. Un ciclo financiero sintético por la API compilada (`scripts/perf/financial-load.ts`):
#      cobertura, liquidación con doble control, recuperación, puente factura→mayor y asiento POSTED;
#      1 de cada 5 CxP queda sin liquidar y 1 de cada 3 recuperaciones queda parcial (saldos abiertos).
#   3. Outbox con los tres estados: el worker real entrega a un receptor local que rechaza 1 de
#      cada 5 eventos con 422 (→ DEAD) y acepta el resto (→ PUBLISHED); después una segunda tanda
#      de carga deja eventos PENDING sin entregar.
#   4. Consultas de conciliación sobre el ORIGEN → `pg_dump -Fc` → base NUEVA → `pg_restore` →
#      las mismas consultas sobre la RESTAURADA. Deben ser idénticas línea a línea.
#   5. RTO medido: crear base + restaurar + conciliar.
#   6. El worker arranca contra la RESTAURADA con un receptor nuevo: debe entregar EXACTAMENTE los
#      PENDING entregables y ninguno de los ya PUBLISHED o DEAD. Los PENDING que están detrás de un
#      DEAD del mismo agregado no se entregan (orden por agregado, P-03) ni en el origen ni en la
#      copia: se cuentan aparte.
#
# Sale con código ≠ 0 si cualquier comprobación falla. Deja el informe en $OUT_DIR/summary.json.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

PG_CONTAINER="${PG_CONTAINER:-atlas-erp-drill-pg}"
PG_PORT="${PG_PORT:-55112}"
API_PORT="${API_PORT:-3198}"
RECEIVER_PORT="${RECEIVER_PORT:-4599}"
LOAD_S="${LOAD_S:-15}"
LOAD_C="${LOAD_C:-2}"
STAMP="$(date +%Y%m%d%H%M%S)"
SRC_DB="drill_src_${STAMP}"
DST_DB="drill_restored_${STAMP}"
OUT_DIR="${OUT_DIR:-${TMPDIR:-/tmp}/atlas-erp-restore-drill/${STAMP}}"
mkdir -p "$OUT_DIR"

export NODE_ENV=test
export DB_SSL=false
export STARTUP_MIGRATIONS_ENABLED=false
export STARTUP_SEEDS_ENABLED=false
export JWT_ACCESS_SECRET="drill_secret_with_more_than_32_characters_ok"
export CORS_ALLOWED_ORIGINS=http://localhost:5273
export LOG_LEVEL=warn
export HTTP_RATE_LIMIT_PER_MINUTE=1000000
export OUTBOX_DELIVERY_SIGNING_SECRET="drill-outbox-signing-secret-with-32-chars-or-more"
export OUTBOX_DELIVERY_URL="http://127.0.0.1:${RECEIVER_PORT}/events"
export OUTBOX_WORKER_POLL_INTERVAL_MS=200
export OUTBOX_RETRY_BASE_MS=200
export OUTBOX_DELIVERY_TIMEOUT_MS=2000
export OUTBOX_LEASE_MS=5000
export PORT="$API_PORT"

FAILED=0
log() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
fail() { echo "FALLO: $*" >&2; FAILED=1; }
url_for() { echo "postgres://postgres:postgres@127.0.0.1:${PG_PORT}/$1"; }
psqlq() { docker exec "$PG_CONTAINER" psql -U postgres -d "$1" -v ON_ERROR_STOP=1 -tAc "$2" | tr -d '\r'; }
now_ms() { node -e 'console.log(Date.now())'; }

PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done; wait 2>/dev/null; }
trap cleanup EXIT

log "Contenedor $PG_CONTAINER"
docker inspect "$PG_CONTAINER" >/dev/null 2>&1 || docker run -d --name "$PG_CONTAINER" \
  -e POSTGRES_PASSWORD=postgres -p "127.0.0.1:${PG_PORT}:5432" postgres:16-alpine >/dev/null
docker start "$PG_CONTAINER" >/dev/null
for _ in $(seq 1 60); do docker exec "$PG_CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
[ -f dist/src/main.js ] || yarn -s build >/dev/null || { echo "build falló" >&2; exit 1; }

log "1. Base origen $SRC_DB migrada"
psqlq postgres "CREATE DATABASE ${SRC_DB}" >/dev/null
DATABASE_URL="$(url_for "$SRC_DB")" yarn -s db:migrate:prod >"$OUT_DIR/migrate.log" 2>&1 || { echo "migración falló" >&2; exit 1; }

start_api() {
  DATABASE_URL="$(url_for "$1")" node dist/src/main.js >>"$OUT_DIR/api.log" 2>&1 &
  API_PID=$!; PIDS+=("$API_PID")
  for _ in $(seq 1 60); do curl -fsS "http://127.0.0.1:${API_PORT}/api/v1/health" >/dev/null 2>&1 && return 0; sleep 1; done
  echo "la API no arrancó" >&2; exit 1
}
stop_pid() { kill "$1" 2>/dev/null; wait "$1" 2>/dev/null; }
start_receiver() { # out-file [reject-every]
  node scripts/ops/outbox-receiver.mjs --port "$RECEIVER_PORT" --secret "$OUTBOX_DELIVERY_SIGNING_SECRET" \
    --reject-every "${2:-0}" --out "$1" >>"$OUT_DIR/receiver.log" 2>&1 &
  RECEIVER_PID=$!; PIDS+=("$RECEIVER_PID"); sleep 1
}
# PENDING que el worker PUEDE entregar: el relay respeta el orden por agregado y no reserva un
# evento si una versión anterior del mismo agregado sigue PENDING o está DEAD. Los que quedan
# detrás de un DEAD esperan a que alguien lo reenvíe (replay), en el origen igual que en la copia.
DELIVERABLE_PENDING="SELECT e.event_key FROM atlas_accounting.event_outbox e
  WHERE e.status = 'PENDING' AND NOT EXISTS (
    SELECT 1 FROM atlas_accounting.event_outbox p
     WHERE p.aggregate_type = e.aggregate_type AND p.aggregate_id = e.aggregate_id
       AND p.aggregate_version < e.aggregate_version AND p.status = 'DEAD')"
drain_outbox() { # db timeout-s
  DATABASE_URL="$(url_for "$1")" node dist/src/workers/outbox/outbox.worker.js >>"$OUT_DIR/worker.log" 2>&1 &
  WORKER_PID=$!; PIDS+=("$WORKER_PID")
  local t0; t0=$(now_ms)
  for _ in $(seq 1 "$2"); do
    [ "$(psqlq "$1" "SELECT count(*) FROM (${DELIVERABLE_PENDING}) d")" = "0" ] && break
    sleep 1
  done
  DRAIN_MS=$(( $(now_ms) - t0 ))
  stop_pid "$WORKER_PID"
}

log "2. Ciclo financiero sintético (fase 1)"
start_api "$SRC_DB"
DATABASE_URL="$(url_for "$SRC_DB")" npx tsx scripts/perf/financial-load.ts \
  --base-url "http://127.0.0.1:${API_PORT}/api/v1" --concurrency "$LOAD_C" --duration "$LOAD_S" \
  --label drill1 --open-every 5 --partial-every 3 --out "$OUT_DIR/load-phase1.json" >/dev/null \
  || fail "conciliación de la carga fase 1"

log "3. Outbox: entregar con rechazos (PUBLISHED + DEAD) y dejar PENDING"
start_receiver "$OUT_DIR/receiver-source.json" 5
drain_outbox "$SRC_DB" 120
stop_pid "$RECEIVER_PID"
DATABASE_URL="$(url_for "$SRC_DB")" npx tsx scripts/perf/financial-load.ts \
  --base-url "http://127.0.0.1:${API_PORT}/api/v1" --concurrency 1 --duration 3 \
  --label drill2 --out "$OUT_DIR/load-phase2.json" >/dev/null || fail "conciliación de la carga fase 2"
stop_pid "$API_PID"
psqlq "$SRC_DB" "SELECT status, count(*) FROM atlas_accounting.event_outbox GROUP BY status ORDER BY 1" | tee "$OUT_DIR/outbox-source.txt"
for s in PENDING PUBLISHED DEAD; do
  [ "$(psqlq "$SRC_DB" "SELECT count(*) FROM atlas_accounting.event_outbox WHERE status='$s'")" -gt 0 ] || fail "no hay eventos $s en el origen"
done

log "4. Conciliación del ORIGEN"
psqlq "$SRC_DB" "$(cat scripts/ops/erp-reconciliation.sql)" >"$OUT_DIR/reconciliation-source.txt" || fail "consultas de conciliación (origen)"
psqlq "$SRC_DB" "${DELIVERABLE_PENDING} ORDER BY 1" >"$OUT_DIR/pending-keys.txt"
psqlq "$SRC_DB" "SELECT count(*) FROM atlas_accounting.event_outbox WHERE status='PENDING'" >"$OUT_DIR/pending-total.txt"

log "5. pg_dump -Fc → base nueva → pg_restore"
T0=$(now_ms)
docker exec "$PG_CONTAINER" pg_dump -U postgres -Fc -f "/tmp/${SRC_DB}.dump" "$SRC_DB" || fail "pg_dump"
DUMP_MS=$(( $(now_ms) - T0 ))
DUMP_BYTES=$(docker exec "$PG_CONTAINER" stat -c %s "/tmp/${SRC_DB}.dump")
T1=$(now_ms)
psqlq postgres "CREATE DATABASE ${DST_DB}" >/dev/null
docker exec "$PG_CONTAINER" pg_restore -U postgres -d "$DST_DB" --exit-on-error "/tmp/${SRC_DB}.dump" \
  >"$OUT_DIR/pg_restore.log" 2>&1 || fail "pg_restore (ver $OUT_DIR/pg_restore.log)"
RESTORE_MS=$(( $(now_ms) - T1 ))
psqlq "$DST_DB" "$(cat scripts/ops/erp-reconciliation.sql)" >"$OUT_DIR/reconciliation-restored.txt" || fail "consultas de conciliación (restaurada)"
RTO_MS=$(( $(now_ms) - T1 ))
if diff -u "$OUT_DIR/reconciliation-source.txt" "$OUT_DIR/reconciliation-restored.txt" >"$OUT_DIR/reconciliation.diff"; then
  echo "   conciliación idéntica ($(wc -l <"$OUT_DIR/reconciliation-source.txt" | tr -d ' ') líneas)"
else
  fail "la conciliación difiere: $OUT_DIR/reconciliation.diff"
fi
for check in balance_debe_menos_haber cxp_vivas_duplicadas_por_cuota cxc_recuperacion_duplicadas cobros_duplicados_por_referencia recuperado_distinto_de_movimientos; do
  value=$(grep "^${check}|" "$OUT_DIR/reconciliation-restored.txt" | cut -d'|' -f2)
  [ "$value" = "0" ] || [ "$value" = "0.00" ] || fail "$check = $value en la restaurada"
done

log "6. El worker contra la RESTAURADA: sólo los PENDING"
start_receiver "$OUT_DIR/receiver-restored.json" 0
drain_outbox "$DST_DB" 120
curl -fsS "http://127.0.0.1:${RECEIVER_PORT}/stats" >"$OUT_DIR/receiver-restored-live.json"
stop_pid "$RECEIVER_PID"
node -e '
const fs = require("fs");
const dir = process.argv[1];
const pending = fs.readFileSync(dir + "/pending-keys.txt", "utf8").split("\n").filter(Boolean);
const got = JSON.parse(fs.readFileSync(dir + "/receiver-restored-live.json", "utf8"));
const delivered = new Set(got.eventKeys);
const missing = pending.filter((k) => !delivered.has(k));
const extra = got.eventKeys.filter((k) => !pending.includes(k));
const total = Number(fs.readFileSync(dir + "/pending-total.txt", "utf8").trim());
const r = { pendingTotal: total, pendingDeliverable: pending.length, pendingBlockedBehindDead: total - pending.length, delivered: got.eventKeys.length, missing: missing.length, extra: extra.length, duplicates: got.eventsDeliveredMoreThanOnce };
fs.writeFileSync(dir + "/redelivery-check.json", JSON.stringify(r, null, 2));
console.log("   " + JSON.stringify(r));
process.exit(missing.length || extra.length || got.eventsDeliveredMoreThanOnce ? 1 : 0);
' "$OUT_DIR" || fail "tras restaurar se entregó algo distinto de los PENDING"

node -e '
const [dir, sha, src, dst, dumpMs, bytes, restoreMs, rtoMs, drainMs, failed] = process.argv.slice(1);
const read = (f) => { try { return JSON.parse(require("fs").readFileSync(dir + "/" + f, "utf8")); } catch { return null; } };
const s = { sha, sourceDb: src, restoredDb: dst, dumpMs: +dumpMs, dumpBytes: +bytes, restoreMs: +restoreMs,
  rtoMs: +rtoMs, redeliveryDrainMs: +drainMs, outboxSource: require("fs").readFileSync(dir + "/outbox-source.txt", "utf8").trim().split("\n"),
  reconciliationLines: require("fs").readFileSync(dir + "/reconciliation-source.txt", "utf8").trim().split("\n").length,
  reconciliationIdentical: require("fs").statSync(dir + "/reconciliation.diff").size === 0,
  redelivery: read("redelivery-check.json"), passed: failed === "0" };
require("fs").writeFileSync(dir + "/summary.json", JSON.stringify(s, null, 2));
console.log(JSON.stringify(s, null, 2));
' "$OUT_DIR" "$(git rev-parse --short HEAD)" "$SRC_DB" "$DST_DB" "$DUMP_MS" "$DUMP_BYTES" "$RESTORE_MS" "$RTO_MS" "$DRAIN_MS" "$FAILED"

if [ "${KEEP_DATABASES:-0}" != "1" ]; then
  psqlq postgres "DROP DATABASE IF EXISTS ${SRC_DB} WITH (FORCE)" >/dev/null
  psqlq postgres "DROP DATABASE IF EXISTS ${DST_DB} WITH (FORCE)" >/dev/null
  docker exec "$PG_CONTAINER" rm -f "/tmp/${SRC_DB}.dump"
fi
echo "Informe: $OUT_DIR/summary.json"
exit "$FAILED"
