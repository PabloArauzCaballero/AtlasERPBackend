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

## 20260924300000-p06-origen-contable-unico.sql

P-06. Un documento contable por factura de comercio (`uq_accounting_document_merchant_invoice_origin`,
sin el libro), un documento por factura (`uq_merchant_invoices_accounting_document`) y un asiento por
documento (`uq_journal_entry_document`), que sustituye la unicidad GLOBAL de `journal_no` —derivado de
un número de documento que es único por entidad legal—. Si los datos no cumplen un índice, la
migración avisa (`WARNING P-06: …`) y no lo crea. El `down` sólo retira índices.

## 20260924300100-p07-mdr-de-la-compra.sql

P-07. Instantánea del MDR cobrado en cada compra BNPL (`mdr_rate_percent`, `mdr_amount`, `mdr_rule_id`,
`mdr_pricing_source`): las reglas MDR se editan en sitio y sin ella la comisión no se reconstruía.
Columnas NULLABLE; las compras anteriores quedan en NULL. El `down` conserva los datos.

## 20260925120000-approval-requests-mdr-rule.sql

`atlas_sales.approval_requests.mdr_rule_id`: la regla de comisión (`mdr_rules`) que espera una
aprobación `MDR_BELOW_MINIMUM`. Hasta ahora sólo las propuestas pasaban por aprobación cuando su MDR
bajaba del mínimo global, y las reglas —que son lo que de verdad se cobra— aceptaban cualquier
tarifa de 0 a 100 sin nadie que la firmara. Una regla por debajo del mínimo nace inactiva y se activa
al aprobarse. Columna aditiva y nula: no toca filas.

## 20260926100000-banda-riesgo-cliente-por-decision-de-core.sql

T-11 (plan `_plan-motor-decisiones-tasa-2026-09-25`). `atlas_sales.customer_risk_tiers`: la última
banda de riesgo de crédito que Core decidió por cliente (`credit.decision.recorded`). Hasta ahora
`registerPurchase` dejaba que el propio comercio declarara `riskTierAtOrigination` en el cuerpo de
la petición — le permitía elegir la tarifa MDR que más le convenga. Tabla nueva, sin efecto sobre
filas existentes; sin fila para un cliente, sigue sin banda conocida, tal cual hoy.

## 20260926200000-siat-fiscal.sql

Núcleo fiscal SIAT (esquema `atlas_accounting`): emisor ante el SIN, CUIS/CUFD con historia, serie
fiscal, eventos de contingencia y paquetes, catálogos sincronizados, bitácora de llamadas y el
documento fiscal v2 (fuente general `source_type`/`source_id`, CHECK de estados, unicidad sólo de los
documentos vivos para poder reemplazar uno rechazado o anulado). Rellena la fuente de las filas
existentes con un UPDATE re-ejecutable. El `down` no borra documentos emitidos.

## 20260926200100-siat-maestros.sql

Datos fiscales en los maestros de ventas: tipo de documento, complemento y correo de facturación
del comercio; producto, unidad y actividad del SIN en el catálogo de productos facturables; moneda y
entidad emisora en la factura de comercio. Va en `db:migrate:portal` porque necesita
`billing_products`.

## 20260926200200-merchant-billing-runs.sql

`atlas_sales.merchant_billing_runs`: una fila por corrida del cierre de facturación de comercios,
con `cycle_key` única (`MONTHLY:2026-09`) para que dos instancias de la API no facturen el mismo
ciclo. Sólo añade una tabla.

## 20260927100000-siat-producto-por-defecto.sql

`siat_issuer_profile.producto_sin_default` y `unidad_medida_default`: el producto del SIN con que
se emiten las facturas AR del emisor, que no tienen catálogo de productos. Sólo añade columnas.

## 20260927110000-siat-correo-comprador.sql

`atlas_accounting.siat_email_delivery`: la cola de correos al comprador de cada documento fiscal
(factura emitida y anulación), única por documento y tipo. Sólo añade una tabla.

## 20260928160000-actividades-comerciales-estado.sql

`atlas_sales.commercial_activities.status` (`PENDING` / `DONE` / `CANCELLED`, CHECK
`ck_commercial_activities_status`, DEFAULT `PENDING`). Rellena las filas existentes con la regla con
que la ficha las pintaba: `completed_at` → `DONE`; con `due_at` o de tipo `TASK` → `PENDING`; el
resto → `DONE`. No toca `completed_at`. Añade dos índices por cuenta para la tabla paginada. El
`down` retira índices, CHECK y columna.

## 20260928230000-actividades-hecha-con-fecha.sql

Regla de la base para lo que el contrato funcional ya decía: una actividad `DONE` lleva `completed_at`
(CHECK `ck_commercial_activities_done_has_completed_at`: `status <> 'DONE' OR completed_at IS NOT NULL`).
Antes del CHECK sanea lo que dejó el backfill de 20260928160000 —notas y llamadas marcadas `DONE` sin
fecha— con `completed_at = created_at`. Idempotente; el `.down.sql` quita la regla y conserva las fechas.
Probada el 2026-09-28 contra una copia de la base de TEST (Contabo): aplicar, repetir, down y up.

## 20260929120000-correo-simulado-no-es-enviado.sql

Amplía los CHECK de estado de `ad_email_messages` y `siat_email_delivery` con `SIMULATED` y
reclasifica como `SIMULATED` (sin `sent_at`) las filas `SENT` que dejó el modo `mock`
(`provider_message_id` con prefijo `mock-`). Un correo que no salió deja de figurar como enviado.
El CHECK se amplía antes del `UPDATE`; la reversa devuelve esas filas a `SENT` y restaura el CHECK.

## 20261002180000-alta-comercio-expediente.sql

Añade a `atlas_sales.b2b_accounts` lo que el expediente del comercio en Atlas exige para enviarse a
revisión y que hasta ahora el comercio tenía que volver a entregar en su portal: `commercial_registry`
(matrícula), `legal_rep_full_name` / `legal_rep_document_type` / `legal_rep_document_number`,
`power_of_attorney_file_id` y `bank_qr_file_id` (ids de `atlas_accounting.erp_file`),
`bank_institution_code` (sigla ASFI) y `bank_account_masked`. Todas nulas y aditivas: se exigen al
abrir el onboarding (`faltantesDelExpediente`), no al registrar la empresa. Al abrir el caso,
`MerchantFolderService` entrega el expediente completo a AtlasBackend y lo envía a revisión. El
`down` se niega si alguna cuenta ya guarda estos datos.

## 20261008120000-sucursal-bnpl-bloqueada-por-atlas.sql

Añade `atlas_sales.merchant_branches.bnpl_blocked_by_atlas` (`NOT NULL DEFAULT false`): la marca «Atlas apagó
a mano la venta a crédito de esta sucursal». Fija la política «comercio aprobado = toda sucursal ACTIVE vende
a crédito» y permite la excepción sin que la regla la reenciende. Aditiva y sin backfill. La reversa se niega
si alguna sucursal está bloqueada.
