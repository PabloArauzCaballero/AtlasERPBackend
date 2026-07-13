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
