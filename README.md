# ATLAS ERP Backend

API del ERP de ATLAS (NestJS 11, TypeScript, Sequelize, PostgreSQL 14+, Zod, JWT, Pino, OpenTelemetry).
Sirve al portal del ERP y al portal del comercio, y hace de pasarela hacia AtlasBackend. El nombre del
paquete y el campo `service` de `/health` son `atlas-integrated-backend`.

Este README describe lo que el código hace hoy. Cuando algo cambie, verifica contra el código y no
contra este texto; las cifras (rutas, pruebas) no se copian aquí porque dejan de ser ciertas con el
siguiente commit.

## Qué hay dentro

Todo vive en `src/modules/`:

| Módulo                           | Qué hace                                                                                                                                                                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth-gateway`                   | Autenticación. El ERP no tiene usuarios propios: delega en AtlasBackend (ver «Autenticación»).                                                                                                                                                                        |
| `b2b-sales-crm`                  | CRM B2B: cuentas, oportunidades, propuestas con aprobación de MDR, contratos, alta de comercios (`b2b/onboarding`), BNPL, cobertura y liquidaciones, calificación de crédito, segmentos, actividades, cierre mensual de facturación y el receptor de eventos de Core. |
| `accounting`                     | Contabilidad: asientos, publicación y reverso, períodos y cierres, facturas por cobrar, recibos, contratos, socios de negocio, grupos de cuentas, estructura financiera, plazos de proveedores y el outbox (`accounting/outbox`).                                     |
| `fiscal/siat`                    | Facturación electrónica con el SIAT (SIN Bolivia), bajo `accounting/fiscal`.                                                                                                                                                                                          |
| `ads`                            | Publicidad externa: anunciantes, campañas, anuncios y creatividades, moderación, entrega (`ads/*`), eventos facturables, ledger, cierre de período y correo de campañas.                                                                                              |
| `portal`                         | Portal del comercio: planes, suscripción, sucursales, facturación, campañas.                                                                                                                                                                                          |
| `catalog`                        | `GET /catalog/domains` y `/catalog/domains/:name`: dominios de valores (selects).                                                                                                                                                                                     |
| `platform-catalog`               | `GET /platform/catalog-manifest` y `/platform/access-runs`, para el catálogo del portal interno. Públicos pero con llave (`x-platform-catalog-key`).                                                                                                                  |
| `documents`                      | `POST /documents/generate`: envía al worker de PDF lo armado por la pantalla, con la clave de servicio.                                                                                                                                                               |
| `files`                          | Adjuntos del ERP (`/files`). Viven en el almacén de evidencia de AtlasBackend, no en Cloudinary.                                                                                                                                                                      |
| `partner-onboarding-gateway`     | Pasarela a AtlasBackend: expediente del comercio (`partner-onboarding`), crédito del comercio (`merchant-credit`), productos de crédito (`credit-products`), soporte (incluido SSE) y Atlas Assist (`internal/assist`).                                               |
| `notification-campaigns-gateway` | Pasarela de campañas masivas (`admin/notification-campaigns`).                                                                                                                                                                                                        |
| `business-action-logs`           | Bitácora de negocio, `GET /audit/business-actions`.                                                                                                                                                                                                                   |
| `health`                         | Sondas.                                                                                                                                                                                                                                                               |

Fuera de `modules/`: `src/workers/outbox/` (proceso aparte), `src/database/` (migraciones y semillas
de arranque), `src/common/` (guards, filtros, numeración de documentos, QR, correo, observabilidad) y
`src/config/` (`env.ts` valida el entorno con Zod y falla al arrancar si algo no cuadra).

## Requisitos e instalación

- Node 22 (`.nvmrc`; `engines` exige `>=22 <23`) y Yarn 1.22.22 vía Corepack. El único lockfile es
  `yarn.lock`: **no uses `npm install`**, reescribe el lockfile.
- PostgreSQL 14+.
- Variables de entorno: parte de `.env.example` (`check:env-example` vigila que esté al día).

```bash
corepack yarn install --frozen-lockfile
```

## Variables de entorno

`src/config/env.ts` es la fuente de verdad (valores por defecto, rangos y reglas cruzadas).
`DATABASE_URL`, `JWT_ACCESS_SECRET` (mín. 32 caracteres) y `CORS_ALLOWED_ORIGINS` son obligatorias;
sin ellas el proceso no arranca. El resto son opcionales, pero cada función se apaga o falla sin las
suyas:

| Función                 | Variables                                                                                                                                                                                                                                                                                                                                                | Sin ellas                                                                                                                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login y pasarelas       | `ATLAS_IDENTITY_BASE_URL` (def. `http://localhost:3005/api/v1`), `ATLAS_IDENTITY_TENANT_ID` (def. `1`), `ATLAS_IDENTITY_TIMEOUT_MS` (def. 8000)                                                                                                                                                                                                          | Los valores por defecto sólo sirven en local: en un entorno real no hay login ni pasarelas.                                                                                                                                           |
| Tokens                  | `JWT_ACCESS_EXPIRES_IN` (15m), `JWT_ACCESS_ISSUER`, `JWT_ACCESS_AUDIENCE`, `JWT_INTERNAL_SECRET`, `JWT_INTERNAL_ISSUER`, `JWT_INTERNAL_AUDIENCE`                                                                                                                                                                                                         | `JWT_INTERNAL_SECRET` es opcional fuera de producción (se deriva del secreto de acceso). En producción es obligatorio y distinto de `JWT_ACCESS_SECRET`.                                                                              |
| Entrega del outbox      | `OUTBOX_DELIVERY_URL`, `OUTBOX_DELIVERY_SIGNING_SECRET` (mín. 32), `OUTBOX_DELIVERY_TIMEOUT_MS`, `OUTBOX_LEASE_MS`, `OUTBOX_MAX_ATTEMPTS`, `OUTBOX_RETRY_BASE_MS`, `OUTBOX_RETRY_MAX_MS`, `OUTBOX_WORKER_*`, `WORKER_SHUTDOWN_TIMEOUT_SECONDS`                                                                                                           | Sin URL el worker no entrega: los eventos quedan `PENDING`. Una URL sin secreto no arranca. `OUTBOX_LEASE_MS` debe ser al menos el doble de `OUTBOX_DELIVERY_TIMEOUT_MS`.                                                             |
| Eventos de Core         | `CORE_EVENTS_SIGNING_SECRET` (mín. 32), `CORE_EVENTS_SIGNATURE_TOLERANCE_SECONDS` (def. 300)                                                                                                                                                                                                                                                             | `POST /integration/core/events` responde 503 y Core reintenta.                                                                                                                                                                        |
| Catálogo de plataforma  | `PLATFORM_CATALOG_API_KEY` (mín. 20)                                                                                                                                                                                                                                                                                                                     | `/platform/*` responde 503 (apagado a propósito).                                                                                                                                                                                     |
| PDF                     | `PDF_WORKER_URL`, `PDF_WORKER_SERVICE_KEY` (mín. 32), `PDF_WORKER_SERVICE_HEADER`, `PDF_WORKER_TIMEOUT_MS`, `PDF_WORKER_BRAND_ID` (def. `atlas-erp`)                                                                                                                                                                                                     | `POST /documents/generate` responde 503.                                                                                                                                                                                              |
| Correo                  | `EMAIL_PROVIDER_MODE` (`mock`, `sendgrid`, `atlas`), `SENDGRID_API_KEY`, `EMAIL_FROM`, `EMAIL_MAX_SEND_ATTEMPTS`, `EMAIL_RETRY_DELAY_MS`, `EMAIL_WORKER_POLL_INTERVAL_MS`                                                                                                                                                                                | Sin modo declarado: `atlas` si hay `OUTBOX_DELIVERY_SIGNING_SECRET` (AtlasBackend envía por su Gmail), `mock` si no. `mock` deja el correo en `SIMULATED` y no se admite con `NODE_ENV=production` ni con SIAT `piloto`/`produccion`. |
| SIAT                    | `SIAT_MODE` (`disabled` por defecto, `mock_server`, `piloto`, `produccion`), `SIAT_MOCK_BASE_URL`, `SIAT_SOAP_BASE_URL`, `SIAT_TOKEN_DELEGADO`, `SIAT_CODIGO_SISTEMA`, `SIAT_QR_BASE_URL`, `SIAT_HTTP_TIMEOUT_MS`, `SIAT_PROCESSOR_INTERVAL_MS`, `SIAT_ONLINE_*`, `SIAT_PACKAGE_MAX_BYTES`, `SIAT_CLOCK_DRIFT_ALERT_S`, `SIAT_OFFLINE_PROBE_INTERVAL_MS` | En `disabled` las facturas se emiten sin documento fiscal («representación interna»). Cada modo exige sus URLs.                                                                                                                       |
| Facturación a comercios | `MERCHANT_BILLING_AUTO_ENABLED` (def. `false`), `MERCHANT_BILLING_CLOSE_HOUR_LOCAL` (0), `MERCHANT_BILLING_DUE_DAYS` (15)                                                                                                                                                                                                                                | El cierre automático está apagado; queda el manual.                                                                                                                                                                                   |
| BNPL                    | `BNPL_OVERDUE_SWEEP_ENABLED` (true), `BNPL_OVERDUE_SWEEP_INTERVAL_MS` (1 h), `BNPL_PAYMENT_NOTICE_REVIEW_HOURS` (72)                                                                                                                                                                                                                                     |                                                                                                                                                                                                                                       |
| Contabilidad            | `ACCOUNTING_APPROVAL_POLICY` (único valor: `ALL_MANUAL_REQUIRE_APPROVAL`)                                                                                                                                                                                                                                                                                | Sin valor, un documento contable manual no se crea (409 `ACCOUNTING_APPROVAL_POLICY_UNAVAILABLE`).                                                                                                                                    |
| Ads                     | `GLOBAL_ADS_ENABLED`, `ADS_DEFAULT_CURRENCY` (BOB), `ADS_EVENT_FRAUD_SCORE_MAX_BILLABLE` (0.8), `ADS_BILLING_TAX_RATE`                                                                                                                                                                                                                                   |                                                                                                                                                                                                                                       |
| HTTP                    | `PORT` (def. 3000; el compose usa 3007), `API_GLOBAL_PREFIX` (`api/v1`), `BODY_LIMIT` (`1mb`), `HTTP_RATE_LIMIT_PER_MINUTE` (120), `LOG_LEVEL`                                                                                                                                                                                                           | Ver el aviso de límite de peticiones más abajo.                                                                                                                                                                                       |
| Base de datos           | `DB_SSL`, `DB_SSL_REJECT_UNAUTHORIZED` (true), `DB_SSL_CA`, `DB_SSL_CA_FILE`, `DB_LOGGING`                                                                                                                                                                                                                                                               | En producción `DB_SSL` es obligatorio y no se admite `DB_SSL_REJECT_UNAUTHORIZED=false`.                                                                                                                                              |
| Arranque                | `STARTUP_MIGRATIONS_ENABLED` (true), `STARTUP_SEEDS_ENABLED` (true), `SEED_SOURCE_*`                                                                                                                                                                                                                                                                     | Ver «Migraciones y semillas».                                                                                                                                                                                                         |
| Trazas                  | `OTEL_ENABLED` y las `OTEL_*`                                                                                                                                                                                                                                                                                                                            | Sin `OTEL_ENABLED=true` la instrumentación no hace nada.                                                                                                                                                                              |
| Sólo local              | `AUTH_DISABLED_FOR_LOCAL_TESTING`, `AUTH_DISABLED_USER_*`, `AUTH_DISABLED_ROLES`                                                                                                                                                                                                                                                                         | Prohibido con `NODE_ENV=production`.                                                                                                                                                                                                  |

Otras reglas de producción: `CORS_ALLOWED_ORIGINS` no admite `*` y `JWT_ACCESS_SECRET` no puede
contener `change-this`.

**Límite de peticiones.** `HTTP_RATE_LIMIT_PER_MINUTE` se cuenta por IP y la API no declara
`trust proxy`: detrás de Traefik o de un proxy de Next todos los usuarios comparten el mismo cupo.
Ver `docs/operations/erp-benchmark-2026-09-24.md`.

**DEV y TEST corren con `NODE_ENV=development`.** `Dockerfile.dev` (el que usa
`docker-compose.coolify.yml`) fija `development` y con eso no se
aplican las validaciones propias de producción de `env.ts`. Sólo `Dockerfile` (compose local y
producción) fija `production`.

## Ejecución local

```bash
corepack yarn start:dev          # API con recarga
corepack yarn dev:worker:outbox  # worker del outbox, proceso aparte
```

Con Docker: `docker-compose.yml` (local; Postgres, `migrate`, `api` en el 3007 y `worker-outbox`),
`docker-compose.coolify.yml` (DEV/TEST) y `docker-compose.jaeger.yml` para trazas
(`jaeger:up`, `jaeger:verify`).

### Sondas

Públicas, bajo el prefijo `/api/v1`:

```txt
GET /health, /health/live    -> {"status":"ok","service":"atlas-integrated-backend"}
GET /ready,  /health/ready   -> comprueba la base de datos (503 READINESS_DATABASE_UNAVAILABLE si falla)
GET /version                 -> service, version, commit, builtAt, environment
```

Para dar un despliegue por bueno mira el cuerpo, no sólo el código: `service` en `/health` y el
`commit` de `/version` (debe ser el empujado; `"version":"unknown"` indica que `APP_VERSION` no se
inyectó). Más en `docs/endpoints/health.md`.

## Autenticación

- El ERP no guarda usuarios. `POST /auth/login` y `/auth/login/pin` van a AtlasBackend (el personal
  interno entra con PIN de segundo factor); el comercio tiene su canal aparte: `/auth/merchant/*`.
- El ERP emite su propio JWT HS256 de 15 min (`JWT_ACCESS_*`). El token y el refresh de AtlasBackend
  nunca llegan al navegador como tal: se guardan en las cookies `atlas_upstream_at` y
  `atlas_upstream_rt`, cada una con su `path`, y las pasarelas las usan para hablar con AtlasBackend
  con el token del actor. AtlasBackend vuelve a aplicar sus roles.
- Los roles de AtlasBackend se traducen a roles de negocio en
  `auth-gateway/role-mapping.ts` (fail-closed: un rol que no está en el mapa no otorga nada). Los
  roles de `ads` son un vocabulario aparte (`ADS_*`) que sólo reciben los roles administrativos.
- Guards globales: Throttler, JWT y Roles con denegación por defecto. Una ruta sin `@Roles` ni
  `@Public()`/`@AnyAuthenticated()` no se abre sola.
- El alcance del portal del comercio (`/portal`) se resuelve contra `atlas_sales.merchant_users`
  (por id de usuario o correo), no contra el JWT. `ADMIN`, `COMMERCIAL_MANAGER` y
  `COMMERCIAL_EXECUTIVE` operan cualquier comercio indicando la cuenta; ese uso queda auditado.
- `/files` y las pasarelas dependen de AtlasBackend: si allí el rol no tiene permiso, aquí también
  falla (p. ej. `merchant_admin` entra en `/files` pero AtlasBackend sólo acepta roles internos en
  `operations/erp-documents`).

## Migraciones y semillas

Hay tres listas del mismo conjunto de archivos SQL y deben coincidir (`check:migration-lists` lo
comprueba): el script `db:migrate:prod`, los `db:migrate:*` por dominio y `STARTUP_MIGRATION_FILES`
(`src/database/startup-migrations.ts`). **Al añadir un `.sql`, actualiza las tres.**

```bash
corepack yarn db:migrate          # todos los dominios, en orden
corepack yarn db:migrate:accounting   # incluye erp_file (004_erp_files.sql), outbox y SIAT fiscal
corepack yarn db:migrate:crm          # atlas_sales; altera atlas_accounting, va tras contabilidad
corepack yarn db:migrate:ads
corepack yarn db:migrate:audit        # business_action_logs
corepack yarn db:migrate:portal
corepack yarn db:seed:pull        # semillas publicadas, desde fuera del repo
```

- En despliegue las aplica el servicio `migrate` con `db:migrate:prod` (tras `build`).
- **La API TAMBIÉN las aplica al arrancar**: `DatabaseSeederService` corre las migraciones pendientes
  (`STARTUP_MIGRATIONS_ENABLED`, por defecto `true`; tabla de control `public.atlas_sql_migrations`
  con checksum: si un archivo ya aplicado cambia, el arranque falla) y luego las semillas
  (`STARTUP_SEEDS_ENABLED`, por defecto `true`).
- La siembra sólo actúa si hay `SEED_SOURCE_*` configurado, y la carga es un **reemplazo** que vacía
  las tablas del manifiesto antes de escribirlas. El arranque la protege con la marca
  `atlas_seed.load_log`: si la base no la tiene, la siembra se ejecuta. No apuntes `SEED_SOURCE_*` a
  una base con datos que quieras conservar. Detalle en `docs/base-de-datos/semillas.md`.
- Las tablas de Ads se crean sin calificar y viven en `atlas_accounting`; el `search_path` con que se
  aplica cada archivo (`atlas_sales`, `atlas_accounting`, `atlas_ads`, `atlas_audit`) es lo que las
  resuelve.

## Procesos en segundo plano

**Dentro del proceso de la API** (corren en TODAS las réplicas; la idempotencia la pone la base):

- `EmailMessagingProcessor`: envía el correo de campañas de Ads, cada `EMAIL_WORKER_POLL_INTERVAL_MS`.
- `B2BOverdueSweepProcessor`: marca `OVERDUE` las cuotas BNPL vencidas (`BNPL_OVERDUE_SWEEP_*`).
- `MerchantBillingCycleProcessor`: cierre mensual de facturación a comercios; sólo si
  `MERCHANT_BILLING_AUTO_ENABLED=true`; revisa cada 15 min y actúa el día 1 (hora de Bolivia) desde
  `MERCHANT_BILLING_CLOSE_HOUR_LOCAL`.
- `FiscalDocumentProcessor`: cola fiscal del SIAT; sólo si `SIAT_MODE` no es `disabled`.

**Worker del outbox** (proceso aparte, servicio `worker-outbox` de los compose):

```bash
corepack yarn dev:worker:outbox     # desarrollo
corepack yarn worker:outbox         # tras build
```

No es un «worker contable»: entrega por HTTP firmado (HMAC-SHA256) los eventos de
`atlas_accounting.event_outbox` a AtlasBackend (`/api/v1/internal/integration/erp/events`) y sólo
marca `PUBLISHED` tras un 2xx. Sin transporte los eventos quedan `PENDING`. Estado, eventos `DEAD` y
reproceso: `GET /accounting/outbox/status`, `/accounting/outbox/events/dead` y
`POST /accounting/outbox/events/:eventKey/replay` (`ADMIN`, `CFO`, `FINANCE`). Contrato en
`src/workers/outbox/README.md`.

## Integración con Core

- Core -> ERP: `POST /integration/core/events` (público, protegido por firma). Verifica
  `x-atlas-signature: t=…,v1=…` sobre el cuerpo CRUDO con `CORE_EVENTS_SIGNING_SECRET`, con ventana
  anti-replay (`CORE_EVENTS_SIGNATURE_TOLERANCE_SECONDS`). Aplica `payment.*` y
  `credit.decision.recorded` una sola vez por `eventKey`.
- ERP -> Core: el outbox de arriba.

## Reglas de negocio que conviene conocer

- **Facturación a comercios.** `POST /b2b/billing/runs` (y el procesador automático) factura los
  cargos pendientes devengados antes del día 1 del mes en curso (hora de Bolivia), bajo la clave del
  último mes cerrado. Es idempotente por `cycle_key`; un comercio que falla no detiene a los demás
  (estado `DONE`, `PARTIAL` o `FAILED`). Roles `FINANCE`, `ADMIN`.
- **Facturación de Ads.** El cierre de período rechaza (409 `BILLING_PERIOD_ALREADY_CLOSED`) cualquier
  solape con una factura no anulada del mismo anunciante, no sólo la igualdad exacta.
- **Moderación de Ads.** Enviar una campaña a revisión crea una revisión por campaña, anuncio y
  creatividad. Sólo la revisión de la campaña misma decide el estado de la campaña; aprobar un
  anuncio o una creatividad los deja `ACTIVE` pero no aprueba la campaña. Aprobar una campaña no la
  activa: es un paso explícito (`PATCH /admin/ads/campaigns/:campaignId/status`). Una revisión ya decidida responde 409
  `MODERATION_REVIEW_ALREADY_DECIDED`, también ante dos decisiones simultáneas.
- **MDR.** Una propuesta con MDR bajo `DEFAULT_MIN_MDR_RATE_PERCENT` (2.5) exige justificación y crea
  una aprobación; quien la pidió no puede aprobarla (cuatro ojos, `FOUR_EYES_REQUIRED`). Lo mismo en
  la revisión de cobertura.
- **Facturación electrónica (SIAT).** Con `SIAT_MODE=disabled` no hay documento fiscal. Con
  `mock_server` se habla con el emulador del SIN del repo de proveedores externos mock; `piloto` y
  `produccion` son SOAP y exigen sus URLs, token y código de sistema. Rutas bajo `accounting/fiscal`
  (roles `admin`, `accountant`).
- **Contabilidad.** Los documentos manuales requieren aprobación según `ACCOUNTING_APPROVAL_POLICY`.
  Una factura contabilizada no se borra: se anula o se reversa su asiento.

### Límites conocidos (auditoría 2026-10-05, aún sin corregir)

- `PATCH` de factura por cobrar y de recibo permite cambiar `status` a mano sin efecto contable.
- Reabrir un período contable (`PATCH /accounting/closings/periods/reopen`, `admin` o `cfo`) no exige
  segunda firma; sí la hay en la liquidación de cobertura y en la aprobación de MDR.
- Los ids de ruta de varios controladores no se validan como uuid: uno inválido da 500
  `DATABASE_ERROR` en lugar de 400.
- Los filtros de fecha de `/audit/business-actions` usan días UTC, no de Bolivia (UTC-4). Los actores
  de comercio (id no uuid) van en `input_summary.actorRef` y no se filtran por `actorUserId`.

Informe completo: `_auditoria-backends-2026-10-05/INFORME.md` en el repo raíz de Atlas.

## Validación

```bash
corepack yarn type-check
corepack yarn lint
corepack yarn format:check
corepack yarn test
corepack yarn test:e2e
corepack yarn check:migration-lists
corepack yarn check:env-example
corepack yarn check:doc-commands
```

`corepack yarn build` y `check:deploy` (que lo incluye) escriben `dist/`: en un árbol compartido,
córrelos en un worktree propio. `test:integration` y `check:accounting-gate` necesitan una base
PostgreSQL migrada. El estado verificado es el del último CI en verde de la rama
(`.github/workflows/ci.yml`).

### Smoke tests

Requieren PostgreSQL migrado, API corriendo y JWT válido (`dev:jwt` genera uno de prueba):

```bash
corepack yarn smoke:b2b
corepack yarn smoke:accounting
corepack yarn smoke:ads
corepack yarn smoke:portal
corepack yarn smoke:all
```

## Documentación

- Endpoints: `docs/endpoints/endpoints.md` y contrato `docs/endpoints/openapi.yaml`.
- Sonda de salud y quién la consume: `docs/endpoints/health.md` (el panel de ATLAS depende de
  `GET /api/v1/health`).
- Arquitectura y flujos: `docs/architecture/`.
- Base de datos y semillas: `docs/base-de-datos/semillas.md`.
- Operación: `docs/operations/` (banco de carga, restauración) y `docs/observability/`.
- Postman: `docs/postman/collection.json`.
- Cumplimiento: `docs/compliance/` (matriz de autorización y decisiones).
- Progreso y auditorías internas: `docs/progress/`, `docs/audit/`.
- Varios módulos tienen su `README.md` en `src/modules/<módulo>/`; compáralo con los controladores
  antes de fiarte, algunos van por detrás del código.
