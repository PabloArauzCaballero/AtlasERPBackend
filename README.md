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

```bash
npm install
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
npm run start:dev
```

Health checks:

```txt
GET /api/v1/health
GET /api/v1/ready
```

## Migraciones y seeders

Ejecuta las migraciones en orden:

```bash
npm run db:migrate
npm run db:seed
```

También puedes ejecutar por módulo:

```bash
npm run db:migrate:crm
npm run db:migrate:accounting
npm run db:migrate:ads
npm run db:seed:crm
npm run db:seed:accounting
npm run db:seed:ads
```

## Validación

```bash
npm run type-check
npm run lint
npm test
npm run test:e2e
npm run build
npm audit --omit=dev
```

Estado verificado en esta entrega:

- Type-check aprobado.
- Lint aprobado.
- Unit tests aprobados: 5 suites, 25 tests.
- E2E tests aprobados: 1 suite, 2 tests.
- Build aprobado.
- Audit producción: 0 vulnerabilidades.

## Smoke tests

Los smoke tests requieren PostgreSQL migrado, API corriendo y JWT válido.

```bash
npm run smoke:b2b
npm run smoke:accounting
npm run smoke:ads
npm run smoke:all
```

## Worker contable outbox

El worker contable es un proceso persistente separado del HTTP API.

Desarrollo:

```bash
npm run dev:worker:outbox
```

Producción después de build:

```bash
npm run worker:outbox
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

- Endpoints: `docs/endpoints/endpoints.md`.
- OpenAPI: `docs/endpoints/openapi.yaml`.
- Arquitectura: `docs/architecture/architecture.md`.
- Flujos: `docs/architecture/flows.md`.
- Postman: `docs/postman/collection.json`.
- Informe de progreso: `docs/progress/progress-report.md`.
