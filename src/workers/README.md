# Workers

Contiene procesos persistentes independientes del API HTTP.

## Worker outbox contable

`outbox/outbox.worker.ts` consume eventos contables pendientes desde PostgreSQL. Está diseñado para ejecutarse como proceso separado bajo PM2, Docker, systemd, Render, Railway, Fly.io, Kubernetes o supervisor equivalente.

No debe depender de llamadas HTTP para activarse.
