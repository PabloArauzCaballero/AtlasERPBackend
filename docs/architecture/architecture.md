# Arquitectura del backend integrado ATLAS

## Decisión de integración

Se integraron tres backends NestJS en un único proceso HTTP y una única conexión Sequelize. La base seleccionada fue CRM/Ventas B2B porque ya contenía logging Pino contextual, throttling, health checks e infraestructura común. Contabilidad y Publicidad externa se agregaron como módulos NestJS explícitos sin reescribir su dominio.

## Módulos registrados

- `B2BSalesCrmModule`: cuentas B2B, oportunidades, propuestas, contratos, onboarding, BNPL, billing, cobertura y conciliación comercial.
- `AccountingModule`: estructura financiera, socios de negocio, documentos contables, facturación, contratos, recibos y cierre contable.
- `AdsModule`: administración de anunciantes, campañas, moderación, inventario, políticas, delivery, eventos, billing y auditoría.

## Integraciones transversales corregidas

- `DatabaseModule` registra modelos de CRM, contabilidad y publicidad en una sola conexión PostgreSQL.
- `JwtAuthGuard` ahora acepta payloads `roleCode`, `role`, `roles`, `legalEntityIds` y tokens internos de Ads.
- `RolesGuard` evalúa permisos contra `roleCode`, `role` y `roles`.
- `RequestContextMiddleware` añade `requestId` para endpoints Ads y trazabilidad.
- Se mantiene logger Pino contextual del CRM, logger Pino de contabilidad y provider `nestjs-pino` requerido por Ads.
- Se corrigieron colisiones de nombres de modelos Sequelize (`AuditLogModel`, `ReconciliationRunModel`, `ReconciliationItemModel`) usando `modelName` explícito.

## Supuestos no críticos documentados

- Los tres módulos comparten `DATABASE_URL`, pero sus tablas/esquemas permanecen separados según sus migraciones originales.
- El prefijo global es único y se configura por `API_GLOBAL_PREFIX`.
- Para compatibilidad, `GLOBAL_API_PREFIX` y `API_PREFIX` se aceptan como alias siempre que no contradigan `API_GLOBAL_PREFIX`.

## Arquitectura fuente: CRM / Ventas B2B

# Arquitectura — ATLAS CRM/Ventas B2B

## Stack

- NestJS como framework backend.
- TypeScript estricto.
- Sequelize + sequelize-typescript como ORM.
- PostgreSQL como base de datos.
- Zod para validación.
- JWT Bearer para autenticación.
- Guards de autenticación y autorización.
- Exception filter global para errores HTTP y Sequelize.
- Response interceptor global para respuestas consistentes.

## Separación de responsabilidades

```txt
src/
  config/                  Configuración y env validado
  database/                Registro Sequelize, migraciones y seeders
  common/                  Guards, pipes, filters, interceptors y tipos compartidos
  modules/
    b2b-sales-crm/         Dominio CRM/Ventas B2B
    accounting/            Contabilidad y asientos
    ads/                   Publicidad B2B (anunciantes, campañas, delivery, ledger)
    portal/                Portal del comercio (usuario partner)
    business-action-logs/  Bitácora transversal de acciones de negocio
    auth-gateway/          Verificación de identidad contra AtlasBackend
    files/                 Documentos del ERP
    health/                Diagnóstico
```

## Bounded contexts implementados

1. `SalesCRM`: cuentas, contactos, oportunidades, propuestas y aprobaciones.
2. `CommercialContracting`: contratos, versiones y términos comerciales.
3. `MerchantOnboarding`: sucursales, usuarios del comercio y checklist.
4. `B2BBilling`: facturas, CxC comercial y pagos.
5. `BNPLCoreLink`: compra BNPL, cuotas, CxP ATLAS→comercio y recuperación consumidor.
6. `ReconciliationAudit`: conciliación y auditoría.
7. `MerchantPortal`: canal del usuario partner. Es el único contexto que cruza CRM, contabilidad y
   publicidad en una misma sesión, por lo que su autorización es por tenant y fail-closed
   (`PortalScopeService`), y comparte las invariantes de campaña con `ads`.

## Persistencia

La migración crea schema `atlas_sales`, enums, tablas, constraints e índices. `synchronize` está deshabilitado para evitar cambios destructivos.

## Autenticación y autorización

El módulo usa JWT Bearer. El payload mínimo esperado es:

```json
{ "sub": "uuid", "roleCode": "ADMIN" }
```

Los controllers declaran roles con `@Roles(...)`. El `RolesGuard` devuelve 403 si el usuario está autenticado pero no tiene permiso.

## Validación

Cada body, params y query de endpoints críticos se valida con `ZodValidationPipe`. Los DTOs se infieren desde schemas Zod, evitando duplicar contratos.

## Errores

`HttpExceptionFilter` normaliza errores:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Los datos enviados no son válidos",
    "details": []
  }
}
```

También traduce errores comunes de Sequelize a 400/409/500 controlados.

## Supuestos documentados

- El módulo se entrega como backend integrable/standalone porque no se recibió un repositorio ATLAS base donde insertar código.
- La integración fiscal SIN/ERP se modela con `external_tax_ref`; no se implementa conector externo real.
- El scoring consumidor pertenece al Core BNPL; aquí solo se conserva referencia `consumers_ref`.
- El mínimo MDR se configura por `DEFAULT_MIN_MDR_RATE_PERCENT`.

## Observabilidad y logging Pino

El módulo usa Pino como logger estructurado JSON. La configuración está centralizada en `src/common/logging` y se aplica en todas las capas críticas del código:

- `main.ts`: inicio del proceso HTTP, puerto y prefijo global.
- `LoggingInterceptor`: traza de cada request, `X-Request-Id`, duración, status, método, path y usuario autenticado cuando existe.
- `JwtAuthGuard` y `RolesGuard`: aceptación/rechazo de autenticación y autorización sin registrar tokens.
- `ZodValidationPipe`: rechazo de validaciones con cantidad de errores y campos afectados, sin bodies completos.
- `HttpExceptionFilter`: errores 5xx e infraestructura normalizados.
- `HealthService`: health/readiness y latencia de verificación de base de datos.
- `B2BSalesCrmService`: inicio de cada caso de uso de negocio.
- `B2BSalesCrmRepository`: transacciones, auditoría y consultas relevantes de persistencia.
- `Sequelize`: SQL solo en `development` y mediante Pino, nunca en producción.

Los logs redactan automáticamente `Authorization`, cookies, tokens, contraseñas y campos sensibles. No se registran cuerpos completos de requests porque eso aumenta riesgo legal y operativo en producción.

## División interna de services B2B

Durante la revisión línea por línea se reemplazó el service monolítico por una fachada `B2BSalesCrmService` y services especializados por subdominio: cuentas, pipeline, contratos, onboarding, BNPL/facturación, cobertura y conciliación. Esta decisión mantiene los controllers estables y reduce el riesgo de que una sola clase acumule reglas incompatibles a largo plazo.

## Arquitectura fuente: Contabilidad

# Arquitectura del módulo contable ATLAS

## 1. Base de diseño

El módulo se implementó como un backend NestJS independiente y listo para integrarse al backend principal de ATLAS. La arquitectura sigue un enfoque SAP-like liviano:

- `legal_entity` como unidad primaria.
- `business_partner` único con roles.
- plan de cuentas formal.
- documentos contables inmutables.
- journal universal.
- submayores AR/AP/bancos/activos/deuda/provisiones.
- cierres por entidad legal y período.
- outbox para integración idempotente.

## 2. Capas

### Capa operativa

Incluye billing events, facturas AR, recibos, business partners y contratos.

### Capa contable

Incluye `accounting_document`, `journal_entry`, `journal_entry_line`, reversos, validación débito/crédito y control de períodos.

### Capa de reporting e integración

Se prepara mediante `close_run`, snapshots del SQL canónico y `event_outbox`. La generación final de estados financieros queda como fase siguiente porque requiere reglas contables/fiscales aprobadas por contabilidad.

## 3. Módulos NestJS

- `HealthModule`: diagnóstico público.
- `AccountingModule`: núcleo funcional.
- `DatabaseModule`: conexión Sequelize.

## 4. Seguridad

Los endpoints contables son privados. Se usa JWT Bearer global con `JwtAuthGuard` y roles con `RolesGuard`.

Roles contemplados:

- `admin`
- `accountant`
- `treasury`
- `cfo`

## 5. Validación

Toda entrada externa pasa por `ZodValidationPipe`.

## 6. Persistencia

Sequelize usa los modelos generados desde el SQL canónico de `systemInfo`. La base de datos esperada es PostgreSQL 14+.

## 7. Diagramas revisados

Disponibles y usados:

- `domainModel.puml`
- `caseUseModel.puml`
- `classDiagram.puml`
- SQL canónico `001_schema_atlas_accounting.sql`
- documentación funcional del ZIP UML

Faltantes:

- state diagram
- activity main flow
- activity diagrams secundarios
- component diagram
- sequence diagram
- deploy diagram

## 8. Supuestos técnicos

1. El sistema de autenticación central de ATLAS ya existe.
2. El módulo recibe JWT Bearer ya emitidos por ATLAS.
3. No se implementa SIAT real porque no se entregaron credenciales, contrato técnico ni entorno.
4. No se implementa worker persistente todavía porque no se definió cola, tópico ni infraestructura.
5. Outbox queda listo para que una fase posterior implemente worker persistente con pg-boss u otra cola aprobada.

## Endurecimiento SAP-like agregado

### Validación de contexto contable

Todo documento contable pasa por `SapPostingValidationService` antes de persistirse. Este servicio valida:

1. Período abierto.
2. Fecha de contabilización dentro del período.
3. Año fiscal de la misma entidad legal.
4. Ledger activo y perteneciente a la entidad legal del documento.
5. Cuentas GL existentes y activas.
6. Dimensiones obligatorias según flags de la cuenta: partner, centro de costo, profit center y tax code.
7. Uso de cuentas de control solo con referencia de submayor.

La misma lógica crítica se refuerza en base de datos mediante `002_hardening_atlas_accounting.sql`.

### Inmutabilidad contable

Los documentos y asientos publicados no se actualizan. Cualquier corrección debe hacerse mediante documento de reverso. Esta regla está aplicada en service y reforzada con triggers de PostgreSQL:

- `trg_posted_accounting_document_immutable`
- `trg_posted_journal_entry_immutable`
- `trg_posted_journal_line_immutable_update`
- `trg_document_audit_log_immutable`

### Cierre contable

`ClosingControlService` ejecuta controles mínimos antes de cerrar un período:

- documentos en DRAFT;
- conciliaciones abiertas;
- líneas bancarias sin matching aprobado.

El resultado queda persistido en `close_run.control_report_json`.

### Preparación de despliegue

Se agregaron scripts reproducibles:

```bash
yarn db:prepare
yarn check:deploy
yarn deploy:audit
```

Y archivos de despliegue local:

- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`

La auditoría completa está en `docs/audit/deployment-readiness-audit.md`.

## Hardening de despliegue agregado

### Build de producción

El proyecto ahora usa `tsconfig.build.json` para compilar únicamente `src/` hacia `dist/`. Esto permite que `npm run start:prod` ejecute `node dist/main.js` sin depender de `dist/src/main.js`.

### Migraciones versionadas

Las migraciones viven en `src/database/migrations` y se aplican con:

```bash
npm run db:migrate
npm run db:migrate:status
npm run db:rollback
```

El runner guarda estado en `atlas_accounting_migrations`, evitando re-ejecutar SQL estructural ya aplicado.

### Seguridad de dependencias

`package.json` fue actualizado a NestJS 11 y se agregó override de `uuid` para eliminar vulnerabilidades reportadas por `npm audit --omit=dev`.

### Autorización por entidad legal

`LegalEntityAccessService` centraliza el control de acceso por entidad legal. Para roles distintos de `admin`, el JWT debe incluir `legalEntityIds`.

### Snapshot de reglas de contabilización

`PostingRuleSnapshotService` resuelve la regla activa en `posting_rule_version` para el origen del documento y guarda su `id` en `accounting_document.policy_snapshot_id`. Esto no convierte el módulo en una copia pesada de SAP, pero sí deja trazabilidad de qué versión de regla estaba vigente al momento del asiento.

## Observabilidad y logging con Pino

El módulo usa `PinoLoggerService` como logger estructurado central. La cobertura incluye:

- Bootstrap HTTP en `main.ts`.
- Controllers para registrar entrada de casos de uso.
- Services para decisiones de negocio, transacciones y estados críticos.
- Guards para autenticación y autorización.
- Pipes para validaciones Zod rechazadas o aceptadas.
- Filters para errores HTTP, Sequelize y excepciones inesperadas.
- Interceptor de respuesta para latencia HTTP.
- Worker outbox persistente.
- Scripts de migración, SQL, smoke y auditoría.

Los campos sensibles como `authorization`, `cookie`, `password`, `token`, `accessToken` y `refreshToken` están redactados por configuración de Pino.

## Arquitectura fuente: Publicidad externa

# Arquitectura — ATLAS Ads

## Alcance implementado

Se implementa un módulo de publicidad externa B2B para ATLAS, separado de publicidad propia. El diseño cubre:

- Portal administrativo interno `/api/v1/admin/ads/*`.
- Runtime interno de delivery/tracking `/api/v1/ads/*`.
- Persistencia PostgreSQL con Sequelize.
- Moderación obligatoria antes de servir anuncios.
- Facturación desde `ad_spend_ledger`, no desde eventos crudos.
- Auditoría para toda mutación sensible.
- RBAC interno separado de roles de anunciantes externos.
- Idempotencia en tracking, ledger y cierre de facturación.

## Módulos NestJS

| Módulo           | Responsabilidad                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| `AdsModule`      | Dominio publicitario completo: anunciantes, campañas, inventario, moderación, delivery, eventos, billing y auditoría. |
| `HealthModule`   | Diagnóstico de API y conexión a base de datos.                                                                        |
| `DatabaseModule` | Configuración centralizada de Sequelize/PostgreSQL.                                                                   |
| `common`         | Guards JWT/RBAC, pipes Zod, filters, interceptors, request context y tipos compartidos.                               |

## Separación de responsabilidades

| Capa       | Responsabilidad                                                                       |
| ---------- | ------------------------------------------------------------------------------------- |
| Controller | Expone endpoints HTTP y aplica guards/pipes. No contiene reglas de negocio.           |
| Service    | Ejecuta casos de uso, reglas de negocio, transacciones y auditoría.                   |
| Repository | Encapsula Sequelize, SQL controlado y operaciones de persistencia.                    |
| Model      | Define estructura persistente, tipos, tablas y relaciones.                            |
| Schema Zod | Valida entrada externa de `body`, `params` y `query`.                                 |
| DTO        | Contratos inferidos desde Zod o estructuras de respuesta controladas.                 |
| Mapper     | Evita devolver modelos Sequelize crudos cuando hay riesgo de exponer campos internos. |

## Autenticación y autorización

La API usa JWT Bearer interno ATLAS. El token debe cumplir:

- Header HTTP: `Authorization: Bearer <jwt>`.
- Firma válida con `JWT_INTERNAL_SECRET`.
- `issuer` igual a `JWT_INTERNAL_ISSUER`.
- `audience` igual a `JWT_INTERNAL_AUDIENCE`.
- Payload con `sub`.
- Payload con `tokenType` igual a `internal_access` o `service_access`.
- Payload con `roles` o `role`.

Roles incluidos:

- `ADS_ADMIN_VIEWER`
- `ADS_ADMIN_MANAGER`
- `ADS_ADMIN_OPERATOR`
- `ADS_MODERATOR`
- `ADS_COMPLIANCE_ADMIN`
- `ADS_INVENTORY_MANAGER`
- `ADS_FINANCE`
- `ADS_AUDITOR`
- `ADS_OPS_MONITOR`
- `ADS_AD_SERVER`
- `ADS_EVENT_TRACKER`
- `ADS_SUPER_ADMIN`

`ADS_SUPER_ADMIN` existe para operación controlada, pero no debe usarse como rol cotidiano.

## Validación

Todos los `body`, `params` y `query` pasan por `ZodValidationPipe` antes de entrar al service.

Validaciones relevantes:

- Identificadores UUID.
- Estados permitidos.
- Montos en micros como enteros positivos.
- Fechas ISO.
- Rangos de fechas no invertidos.
- Moneda ISO de tres letras.
- Motivos obligatorios para mutaciones sensibles.
- Perfil fiscal activo antes de facturar.

## Persistencia

El esquema se basa en los artefactos SQL/DBML del ZIP v2, con ajustes controlados para soportar el contrato administrativo:

1. `ad_inventory_placements.allowed_formats_json` y `billing_model` para soportar `allowedFormats` y `billingModel`.
2. `ad_moderation_reviews.decision` incluye `PENDING_REVIEW` y `ESCALATED` porque la cola administrativa necesita estados previos a decisión.
3. Índices únicos parciales para idempotencia de eventos, ledger y cierre de facturación.

No se usa `sequelize.sync({ force: true })` ni `sequelize.sync({ alter: true })`. Los cambios estructurales van por migraciones.

## Transacciones

Las mutaciones críticas se ejecutan dentro de transacciones iniciadas en services:

- Alta de anunciante.
- Creación de perfil fiscal.
- Cambio de estado de anunciante.
- Creación de campañas.
- Moderación.
- Tracking facturable.
- Cambio de billable status.
- Cierre de facturación.
- Registro de pagos.

Los repositories aceptan `transaction` pero no deciden por sí mismos el alcance transaccional.

## Idempotencia y consistencia contable

El tracking protege duplicados con `deliveryDecisionId + eventType + requestId`.

La facturación usa `ad_spend_ledger` como fuente de verdad. El ledger admite cargos, créditos y ajustes. Esto evita que un evento corregido rompa la contabilidad histórica.

El cierre de periodo protege duplicados por `advertiserId + currency + periodStart + periodEnd`.

## Logs y observabilidad

Se usa `nestjs-pino` con redacción de:

- `authorization`.
- cookies.
- contraseñas.
- tokens en body.
- access/refresh tokens.

Cada request recibe `requestId`. Si el cliente envía un `x-request-id`, solo se acepta cuando cumple formato seguro.

## Health checks

- `GET /api/v1/health`: servidor vivo.
- `GET /api/v1/ready`: servidor listo y conexión a PostgreSQL válida.

## Supuestos documentados

- No se implementa DSP/RTB externo.
- Segmentación solo contextual/corporativa.
- El impuesto de facturación queda en `ADS_BILLING_TAX_RATE`, por defecto `0`, hasta definir regla fiscal/SIN.
- El endpoint de delivery es interno y requiere rol de servicio `ADS_AD_SERVER`.
- El endpoint de eventos es interno y requiere `ADS_EVENT_TRACKER` o `ADS_AD_SERVER`.
- La emisión fiscal legal queda fuera de esta fase y debe integrarse antes de producción comercial real.

---

## Business action log y operaciones no CRUD

La arquitectura integrada contempla tres niveles de observabilidad y auditoría:

1. **Pino / logs técnicos**: trazabilidad técnica, errores, request lifecycle y diagnóstico operativo.
2. **Audit logs específicos por dominio**: cambios dentro de CRM, documentos contables y publicidad.
3. **Business action logs transversales**: procesos de negocio que impactan múltiples tablas o procesan batches.

El modelo transversal `BusinessActionLogModel` vive en `src/database/models/business_action_log.model.ts` y persiste en `atlas_audit.business_action_logs`. El módulo `BusinessActionLogsModule` expone consulta administrativa en `GET /api/v1/audit/business-actions` y permite que services críticos registren acciones de negocio dentro de la misma transacción.

Esta separación evita confundir logs técnicos con auditoría de negocio. Un error HTTP no necesariamente representa una acción de negocio, y una acción de negocio puede crear/actualizar varias entidades en una misma transacción.

## Soporte BULK / BATCH

El backend admite operaciones bulk explícitas en CRM, Contabilidad y Publicidad. Los batches no se implementan como loops sin control desde el frontend: cada endpoint valida límites, duplicados internos y contratos individuales con Zod antes de ejecutar lógica transaccional.

Endpoints bulk actuales:

- `POST /api/v1/b2b/accounts/bulk`
- `POST /api/v1/accounting/documents/bulk`
- `POST /api/v1/admin/ads/advertisers/bulk`
- `POST /api/v1/ads/events/bulk`

Cada batch registra una entrada en `atlas_audit.business_action_logs` con correlación por `batchExternalId` cuando se envía.
