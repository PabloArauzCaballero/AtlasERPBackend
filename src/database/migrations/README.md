# Migraciones

Contiene scripts SQL versionados para crear o modificar la estructura de base de datos.

## Convenciones

- No usar `sequelize.sync({ force: true })` ni `sequelize.sync({ alter: true })` en producción.
- Cada cambio estructural debe quedar en una migración revisable.
- Las migraciones deben ejecutarse con `npm run db:migrate` o el mecanismo aprobado por despliegue.

## 20260709010000-create-business-action-logs.sql

Crea el esquema `atlas_audit` y la tabla `business_action_logs`, usada para auditoría transversal de acciones de negocio y batches. Esta tabla es distinta de los logs técnicos Pino y de las auditorías específicas por dominio.

## 20260826220000-catalogo-productos-facturables.sql

Crea `atlas_sales.billing_products` —el catálogo de lo que Atlas le factura al comercio: alcance,
clics y comisión de venta— y enlaza los cargos y las líneas de factura a él por `product_id`. El
precio unitario NO vive aquí: es de cada tarifa (`merchant_plans.cpm_micros` / `cpc_micros`), que se
configura desde el ERP. Su siembra mínima es
`seeders/20260826221000-seed-billing-products.sql`.

## 20260827120000-crm-segments-por-sujeto.sql

Crea `atlas_sales.crm_segments`: los segmentos comerciales del ERP, con la columna `subject` que
dice a quién agrupa cada uno —`CREDIT_APPLICANT` (cliente que solicita crédito y compra a plazos) o
`PARTNER` (cuenta B2B)—. Es lo que separa tres poblaciones que el menú confundía bajo la palabra
«usuarios»: el usuario del propio ERP (`internal_users`) no se segmenta, se administra, y su única
relación con un segmento es ser su `owner_user_id`. Tampoco es la audiencia publicitaria
(`ad_target_segments`), que responde a quién se le SIRVE un anuncio. El vocabulario admisible de
`definition_json` está en `modules/b2b-sales-crm/domain/crm-segments.ts` y se valida en el borde.

## 20260906140000-merchant-user-identity-request.sql

Añade `atlas_sales.merchant_users.identity_request_id`: la petición de alta de identidad encolada
en AtlasBackend que respalda a ese usuario del comercio. Se escribió el 2026-09-06 pero **no se
registró en ninguna de las tres listas** (`db:migrate:prod`, `db:migrate:crm`,
`STARTUP_MIGRATION_FILES`), así que ningún entorno migrado desde entonces tenía la columna y
`POST /b2b/onboarding/merchant-users` moría en la base. Registrada el 2026-09-08.

## 20260908120000-onboarding-case-lifecycle.sql

El caso de onboarding guarda su posición en la cadena ERP → Motor → Portal → ERP: el desenlace del
KYB del Motor (`decision_*`, `manual_review_case_code`, `decided_at`), el acuse de la identidad
concedida (`identity_acknowledged_at`) y el contrato pactado para el alta (`contract_version_id`,
del que cuelga la comisión). Añade `b2b_accounts.partner_profile_id`, el puente al expediente del
comercio en AtlasBackend, sin el cual no hay a quién pedirle la verificación.

## 20260909100000-merchant-user-identity-rejection.sql

`atlas_sales.merchant_users.identity_rejection_reason`: el motivo con el que Atlas rechazó el acceso
pedido. El acuse lo recibía y lo tiraba; ahora la fila de la cola lo enseña sin volver a preguntar.
