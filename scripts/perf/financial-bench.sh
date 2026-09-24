#!/usr/bin/env bash
#
# Banco de carga de las rutas financieras del ERP (P-16): API compilada + PostgreSQL efímero.
#
#   yarn build && bash scripts/perf/financial-bench.sh
#   SCENARIOS="scale sustained" SUSTAINED_S=300 bash scripts/perf/financial-bench.sh
#
# Escenarios (un JSON por escenario en $OUT_DIR):
#   scale            1, 4 y 8 trabajadores, SCALE_S segundos cada uno
#   sustained        CONCURRENCY trabajadores durante SUSTAINED_S
#   throttle         el límite por omisión (120/min por IP) para ver el 429 separado de lo técnico
#   postgres-outage  Postgres detenido a mitad de la carga y vuelto a arrancar; la conciliación de
#                    después debe seguir en cero (ninguna CxP, CxC, cobro ni documento duplicado)
#   outbox-drain     el worker real entrega el backlog que dejó la carga a un receptor local;
#                    mide el tiempo de drenaje y que nada se entregue dos veces
#
# Es un banco de DESARROLLO: los números describen la máquina donde corre, no un SLO.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

PG_CONTAINER="${PG_CONTAINER:-atlas-erp-bench-pg}"
PG_PORT="${PG_PORT:-55112}"
API_PORT="${API_PORT:-3198}"
RECEIVER_PORT="${RECEIVER_PORT:-4598}"
DB_NAME="${DB_NAME:-atlas_erp_bench_$(date +%Y%m%d%H%M%S)}"
OUT_DIR="${OUT_DIR:-${TMPDIR:-/tmp}/atlas-erp-bench/$(date +%Y%m%d-%H%M%S)}"
SCENARIOS="${SCENARIOS:-scale sustained throttle postgres-outage outbox-drain}"
SCALE_LEVELS="${SCALE_LEVELS:-1 4 8}"
SCALE_S="${SCALE_S:-45}"
CONCURRENCY="${CONCURRENCY:-4}"
SUSTAINED_S="${SUSTAINED_S:-180}"
mkdir -p "$OUT_DIR"

export NODE_ENV=test
export DB_SSL=false
export STARTUP_MIGRATIONS_ENABLED=false
export STARTUP_SEEDS_ENABLED=false
export JWT_ACCESS_SECRET="bench_secret_with_more_than_32_characters_ok"
export CORS_ALLOWED_ORIGINS=http://localhost:5273
export LOG_LEVEL=warn
export PORT="$API_PORT"
export DATABASE_URL="postgres://postgres:postgres@127.0.0.1:${PG_PORT}/${DB_NAME}"

log() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
psqlq() { docker exec "$PG_CONTAINER" psql -U postgres -d "$1" -tAc "$2" | tr -d '\r'; }
now_ms() { node -e 'console.log(Date.now())'; }

log "Contenedor $PG_CONTAINER y base $DB_NAME"
docker inspect "$PG_CONTAINER" >/dev/null 2>&1 || docker run -d --name "$PG_CONTAINER" \
  -e POSTGRES_PASSWORD=postgres -p "127.0.0.1:${PG_PORT}:5432" postgres:16-alpine >/dev/null
docker start "$PG_CONTAINER" >/dev/null
for _ in $(seq 1 60); do docker exec "$PG_CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
psqlq postgres "CREATE DATABASE ${DB_NAME}" >/dev/null
[ -f dist/src/main.js ] || yarn -s build >/dev/null
yarn -s db:migrate:prod >"$OUT_DIR/migrate.log" 2>&1 || { echo "migración falló" >&2; exit 1; }

API_PID=""
start_api() { # límite por minuto (por omisión, sin límite práctico para medir capacidad)
  HTTP_RATE_LIMIT_PER_MINUTE="${1:-1000000}" node dist/src/main.js >>"$OUT_DIR/api.log" 2>&1 &
  API_PID=$!
  for _ in $(seq 1 60); do curl -fsS "http://127.0.0.1:${API_PORT}/api/v1/health" >/dev/null 2>&1 && return 0; sleep 1; done
  echo "la API no quedó lista" >&2; return 1
}
stop_api() { [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null; wait "$API_PID" 2>/dev/null; API_PID=""; }
trap stop_api EXIT INT TERM

load() { # label concurrency duration
  npx tsx scripts/perf/financial-load.ts --base-url "http://127.0.0.1:${API_PORT}/api/v1" \
    --label "$1" --concurrency "$2" --duration "$3" --pid "$API_PID" --out "$OUT_DIR/$1.json" >/dev/null
  local rc=$?
  node -e '
const d = require(process.argv[1]);
const s = d.steps;
const f = (k) => `${k} p50=${s[k].p50} p95=${s[k].p95} p99=${s[k].p99}`;
console.log(`== ${d.label}: c=${d.concurrency} ${d.durationS}s ciclos=${d.cycles} (${d.cyclesPerS}/s) peticiones/s=${d.requestsPerS} técnicos=${d.technicalErrors}`);
console.log("   " + ["schedule","settle","approve","recover","bridge","post"].map(f).join(" | "));
console.log("   parejas " + JSON.stringify(d.pairs) + "  RSS " + JSON.stringify(d.rss));
console.log("   conciliación " + JSON.stringify(d.reconciliation));
' "$OUT_DIR/$1.json"
  [ "$rc" = "0" ] || echo "   ¡CONCILIACIÓN CON DIFERENCIAS! (código $rc)"
}

start_api || exit 1
for scenario in $SCENARIOS; do
  case "$scenario" in
    scale) for c in $SCALE_LEVELS; do log "Escalado c=$c"; load "scale-c$c" "$c" "$SCALE_S"; done ;;
    sustained) log "Sostenida c=$CONCURRENCY ${SUSTAINED_S}s"; load sustained "$CONCURRENCY" "$SUSTAINED_S" ;;
    throttle)
      log "Límite por omisión (120/min por IP)"; stop_api; start_api 120 || exit 1
      load throttle 2 20; stop_api; start_api || exit 1 ;;
    postgres-outage)
      log "Caída de Postgres (15 s dentro, 20 s fuera)"
      load postgres-outage "$CONCURRENCY" 60 &
      lp=$!; sleep 15; docker stop -t 1 "$PG_CONTAINER" >/dev/null; echo "   $(date +%T) Postgres detenido"
      sleep 20; docker start "$PG_CONTAINER" >/dev/null; echo "   $(date +%T) Postgres arrancado"
      for _ in $(seq 1 60); do docker exec "$PG_CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
      wait "$lp"
      # Sin reintento en el generador: los ciclos cortados a mitad quedan a medias (CxP sin
      # liquidar, factura sin asiento), pero la conciliación debe seguir en cero.
      echo "   API tras la caída: $(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${API_PORT}/api/v1/health")" ;;
    outbox-drain)
      log "Drenaje del outbox con el worker real"
      pending=$(psqlq "$DB_NAME" "SELECT count(*) FROM atlas_accounting.event_outbox WHERE status='PENDING'")
      node scripts/ops/outbox-receiver.mjs --port "$RECEIVER_PORT" --secret "bench-outbox-signing-secret-with-32-chars-min" \
        --out "$OUT_DIR/outbox-receiver.json" >/dev/null 2>&1 &
      rp=$!; sleep 1; t0=$(now_ms)
      OUTBOX_DELIVERY_URL="http://127.0.0.1:${RECEIVER_PORT}/events" \
        OUTBOX_DELIVERY_SIGNING_SECRET="bench-outbox-signing-secret-with-32-chars-min" \
        OUTBOX_WORKER_POLL_INTERVAL_MS=200 OUTBOX_WORKER_BATCH_SIZE="${OUTBOX_BATCH:-25}" \
        node dist/src/workers/outbox/outbox.worker.js >>"$OUT_DIR/worker.log" 2>&1 &
      wp=$!
      for _ in $(seq 1 600); do
        [ "$(psqlq "$DB_NAME" "SELECT count(*) FROM atlas_accounting.event_outbox WHERE status='PENDING'")" = "0" ] && break
        kill -0 "$wp" 2>/dev/null || { echo "   el worker terminó antes de drenar (ver $OUT_DIR/worker.log)"; break; }
        sleep 1
      done
      ms=$(( $(now_ms) - t0 ))
      kill "$wp" 2>/dev/null; wait "$wp" 2>/dev/null; kill "$rp" 2>/dev/null; wait "$rp" 2>/dev/null
      echo "{\"pendingBefore\":$pending,\"drainMs\":$ms,\"eventsPerS\":$(node -e "console.log(($pending/($ms/1000)).toFixed(1))"),\"after\":\"$(psqlq "$DB_NAME" "SELECT string_agg(status||'='||n, ',') FROM (SELECT status, count(*) n FROM atlas_accounting.event_outbox GROUP BY status) s")\"}" \
        | tee "$OUT_DIR/outbox-drain.json"
      node -e 'const r=require(process.argv[1]);console.log("   receptor: aceptados="+r.accepted+" distintos="+r.distinctEvents+" entregados-más-de-una-vez="+r.eventsDeliveredMoreThanOnce+" firma-inválida="+r.badSignature)' "$OUT_DIR/outbox-receiver.json" ;;
    *) echo "escenario desconocido: $scenario" >&2 ;;
  esac
done
stop_api
echo "Resultados en $OUT_DIR (SHA $(git rev-parse --short HEAD), base $DB_NAME)"
