# Worker Outbox

Proceso persistente que ENTREGA los eventos de `atlas_accounting.event_outbox` a un receptor y
sólo los marca publicados cuando el receptor confirma (P-03 · B05). Hasta el 2026-09-24 escribía
una línea de log y asignaba `published_at`: nada salía del ERP.

## Garantía

- Entrega **al menos una vez**. El efecto único lo pone la **inbox del consumidor**
  (`src/common/events/event-inbox.ts`): clave única por evento registrada en la misma transacción
  que el efecto.
- `published_at` se asigna **sólo** tras un 2xx del receptor. Un CHECK de la base
  (`chk_event_outbox_published_consistent`) impide un `published_at` en un evento PENDING o DEAD.
- Orden por agregado: `aggregate_version` (trigger al insertar; los productores no cambian). El
  worker sólo reserva la cabeza de cada agregado y el sobre lleva la versión para que el consumidor
  descarte una versión vieja (`ordering: 'latest-state'`).

## Ciclo (`outbox-relay.ts`)

1. **Reserva** (una sentencia, `FOR UPDATE SKIP LOCKED`): pone `lease_owner` y `lease_expires_at`
   e incrementa `attempts`. Si el worker muere, el lease caduca y otro lo retoma.
2. **Entrega** fuera de transacción: `POST` firmado a `OUTBOX_DELIVERY_URL`.
3. **Marca** (otra sentencia corta): PUBLISHED con ACK; si no, backoff
   `base · 2^(intento−1)` con tope, o DEAD si se agotó (`OUTBOX_MAX_ATTEMPTS`) o el receptor
   respondió 400/410/413/415/422. `last_error` se guarda redactado (sin cuerpo, cabeceras ni
   secretos).

Estados: `PENDING` · `PUBLISHED` · `DEAD` · `LEGACY_LOG_ONLY` (filas que el worker antiguo marcó
«publicadas» sin entregarlas; no se reenvían solas).

## Contrato con el receptor

`POST <OUTBOX_DELIVERY_URL>` con cuerpo JSON (`OutboxEnvelope`, `spec: atlas.erp.outbox/1`):
`eventKey`, `topic`, `schemaVersion`, `aggregate {type,id,version}`, `occurredAt`, `payload`.

Cabeceras: `x-atlas-event-key`, `x-atlas-topic`, `x-atlas-delivery-attempt`, `traceparent` /
`tracestate` (W3C) y `x-atlas-signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<cuerpo>")>`.
El receptor verifica con `verifyOutboxSignature` (cuerpo CRUDO, ventana de 300 s), aplica el efecto
con `consumeOnce` y responde 2xx **después** de confirmar. Un duplicado también responde 2xx.

Hoy no hay receptor desplegado en ningún servicio: sin `OUTBOX_DELIVERY_URL` el worker no reserva
nada, deja los eventos PENDING y lo avisa cada minuto con el tamaño de la cola.

## Operación

- `GET /api/v1/accounting/outbox/status`: conteos por estado, en vuelo, edad del pendiente más
  antiguo, intentos máximos y si hay transporte configurado.
- `GET /api/v1/accounting/outbox/events/dead?limit=`: eventos agotados con su error redactado.
- `POST /api/v1/accounting/outbox/events/:eventKey/replay` `{ "reason": "…" }`: devuelve a
  PENDING un DEAD o LEGACY_LOG_ONLY; queda en `business_action_logs`.
- Roles: `ADMIN`, `CFO`, `FINANCE`.

## Ejecución

```bash
yarn build
yarn worker:outbox
```

En desarrollo: `yarn dev:worker:outbox`.

## Variables

- `OUTBOX_WORKER_ENABLED`, `OUTBOX_WORKER_POLL_INTERVAL_MS`, `OUTBOX_WORKER_BATCH_SIZE`,
  `WORKER_SHUTDOWN_TIMEOUT_SECONDS`
- `OUTBOX_DELIVERY_URL` (sin ella no hay entrega), `OUTBOX_DELIVERY_SIGNING_SECRET` (≥ 32,
  obligatoria con la URL), `OUTBOX_DELIVERY_TIMEOUT_MS`
- `OUTBOX_LEASE_MS` (≥ 2 × timeout), `OUTBOX_MAX_ATTEMPTS`, `OUTBOX_RETRY_BASE_MS`,
  `OUTBOX_RETRY_MAX_MS`

## Pruebas

- `test/outbox-http-publisher.spec.ts`: firma, 2xx/4xx/5xx, timeout, red caída, redacción.
- `test/outbox-delivery.integration.spec.ts`: contra PostgreSQL real
  (`ATLAS_OUTBOX_IT_DATABASE_URL=postgres://…/postgres`); crea y borra su propia base.
