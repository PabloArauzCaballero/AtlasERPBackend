# Worker Outbox

Proceso persistente encargado de consumir `atlas_accounting.event_outbox`.

## Responsabilidad

- Leer eventos no publicados con `FOR UPDATE SKIP LOCKED`.
- Procesar eventos de forma idempotente mediante `event_key` y `published_at`.
- Marcar eventos como publicados únicamente después de procesamiento exitoso.
- Mantenerse vivo como proceso independiente del API HTTP.
- Manejar `SIGINT` y `SIGTERM` para apagado controlado.

## Ejecución

```bash
npm run build
npm run worker:outbox
```

En desarrollo:

```bash
npm run dev:worker:outbox
```

## Variables

- `OUTBOX_WORKER_ENABLED`
- `OUTBOX_WORKER_POLL_INTERVAL_MS`
- `OUTBOX_WORKER_BATCH_SIZE`
- `WORKER_SHUTDOWN_TIMEOUT_SECONDS`
