# ATLAS Integrated Backend

Backend integrado para tres módulos ATLAS:

- CRM / Ventas B2B.
- Contabilidad.
- Publicidad externa.

El proyecto usa NestJS, TypeScript, Sequelize, PostgreSQL, Zod, JWT y Pino. La integración mantiene los dominios separados y unifica infraestructura transversal: configuración, base de datos, guards, roles, logging, health checks, OpenAPI, Postman, migraciones y scripts de validación.

## Requisitos

- Node.js 22 o compatible.
- PostgreSQL 14+.
- Variables de entorno basadas en `.env.example`.

## Instalación

Usar Node 22 (`.nvmrc`) y Yarn 1.22.22 mediante Corepack. El único lockfile
versionado es `yarn.lock`.

```bash
corepack yarn install --frozen-lockfile
```

## Variables de entorno críticas

Configura al menos:

```bash
DATABASE_URL=postgres://usuario:password@host:5432/base
JWT_ACCESS_SECRET=secreto-largo-minimo-32-caracteres
JWT_INTERNAL_SECRET=secreto-interno-largo-minimo-32-caracteres
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

`API_GLOBAL_PREFIX` define el prefijo global. Por defecto es `api/v1`.

## Ejecución local

```bash
corepack yarn start:dev
```

Health checks:

```txt
GET /api/v1/health
GET /api/v1/ready
```

## Migraciones y seeders

Ejecuta las migraciones en orden:

```bash
corepack yarn db:migrate
corepack yarn db:seed:pull
```

Los datos de semilla viven fuera del repositorio desde el 2026-09; ver `docs/base-de-datos/semillas.md`. En
despliegue las migraciones las aplica el servicio `migrate` con `db:migrate:prod` (tras `build`).

También puedes ejecutar por módulo:

```bash
corepack yarn db:migrate:crm
corepack yarn db:migrate:accounting
corepack yarn db:migrate:ads
corepack yarn db:migrate:audit
corepack yarn db:migrate:portal
```

La contabilidad va primero: `db:migrate:crm` incluye una migración que altera `atlas_accounting`.
No hay semillas por módulo: `db:seed:pull` trae el conjunto publicado entero.

## Validación

```bash
corepack yarn type-check
corepack yarn lint
corepack yarn test
corepack yarn test:e2e
corepack yarn build
```

Estado verificado en esta entrega:

- Type-check aprobado.
- Lint aprobado.
- Unit tests aprobados: 17 suites, 121 tests.
- E2E tests aprobados: 1 suite, 2 tests.
- Build aprobado.
- Audit producción: 0 vulnerabilidades.

## Smoke tests

Los smoke tests requieren PostgreSQL migrado, API corriendo y JWT válido.

```bash
corepack yarn smoke:b2b
corepack yarn smoke:accounting
corepack yarn smoke:ads
corepack yarn smoke:portal
corepack yarn smoke:all
```

## Worker contable outbox

El worker contable es un proceso persistente separado del HTTP API.

Desarrollo:

```bash
corepack yarn dev:worker:outbox
```

Producción después de build:

```bash
corepack yarn worker:outbox
```

## Estructura principal

```txt
src/
  app.module.ts
  main.ts
  common/
  config/
  database/
  modules/
    b2b-sales-crm/
    accounting/
    ads/
  workers/
    outbox/
docs/
  endpoints/
  architecture/
  postman/
  progress/
  source-modules/
prompt/
```

## Documentación

- [Sonda de salud y quién la consume](docs/endpoints/health.md) — el panel de ATLAS depende de `GET /api/v1/health`.

- Endpoints: `docs/endpoints/endpoints.md`.
- OpenAPI: `docs/endpoints/openapi.yaml`.
- Arquitectura: `docs/architecture/architecture.md`.
- Flujos: `docs/architecture/flows.md`.
- Postman: `docs/postman/collection.json`.
- Informe de progreso: `docs/progress/progress-report.md`.
