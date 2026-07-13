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
