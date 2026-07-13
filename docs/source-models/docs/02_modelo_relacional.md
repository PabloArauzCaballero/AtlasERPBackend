# Modelo relacional recomendado — CRM/Ventas B2B ATLAS

## Principio central

El modelo separa tres naturalezas financieras:

1. **`merchant_receivables`**: lo que el comercio debe a ATLAS por MDR, suscripciones, fees, penalidades o servicios.
2. **`merchant_payables`**: lo que ATLAS debe al comercio cuando cubre una cuota impaga del consumidor.
3. **`consumer_recovery_receivables`**: lo que el consumidor debe a ATLAS después de que ATLAS cubrió una cuota al comercio.

No se debe usar una única tabla genérica de CxC para todo porque destruiría la trazabilidad económica del modelo BNPL.

---

## 1. Maestros B2B

### `b2b_accounts`

Representa clientes corporativos: comercios, retailers, concesionarias, partners o distribuidores.

| Campo            | Tipo                    | Descripción                                                                             |
| ---------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| id               | uuid PK                 | Identificador de cuenta B2B.                                                            |
| legal_name       | varchar                 | Razón social.                                                                           |
| trade_name       | varchar                 | Nombre comercial.                                                                       |
| tax_id           | varchar unique nullable | NIT u otro identificador tributario.                                                    |
| account_type     | enum                    | MERCHANT, PARTNER, DISTRIBUTOR, FINANCIAL_ALLY.                                         |
| industry         | varchar                 | Rubro.                                                                                  |
| lifecycle_status | enum                    | LEAD, QUALIFIED, CUSTOMER, SUSPENDED, TERMINATED.                                       |
| owner_user_id    | uuid FK                 | Ejecutivo responsable.                                                                  |
| territory_id     | uuid FK                 | Territorio comercial.                                                                   |
| risk_tier        | enum nullable           | Bajo, medio, alto. Se usa para gestión comercial/operativa, no para scoring consumidor. |
| created_at       | timestamptz             | Fecha de creación.                                                                      |
| updated_at       | timestamptz             | Última actualización.                                                                   |

Relaciones:

- 1 cuenta tiene N contactos.
- 1 cuenta tiene N oportunidades.
- 1 cuenta puede tener N contratos/versiones.
- 1 cuenta puede tener N sucursales.
- 1 cuenta puede tener N facturas B2B.

### `b2b_contacts`

Contactos corporativos del comercio.

Campos clave: `id`, `account_id`, `full_name`, `role_title`, `email`, `phone`, `is_primary`, `decision_role`, `status`.

### `territories`

Segmentación comercial por ciudad, zona, rubro o cartera.

### `internal_users`

Usuarios internos: ejecutivos, jefes, finanzas, legal, operaciones.

---

## 2. Pipeline comercial

### `sales_opportunities`

Negociación comercial con un cliente corporativo.

| Campo                    | Tipo             | Descripción                                                                            |
| ------------------------ | ---------------- | -------------------------------------------------------------------------------------- |
| id                       | uuid PK          | Oportunidad.                                                                           |
| account_id               | uuid FK          | Cuenta B2B.                                                                            |
| owner_user_id            | uuid FK          | Ejecutivo responsable.                                                                 |
| name                     | varchar          | Nombre de oportunidad.                                                                 |
| opportunity_type         | enum             | NEW_MERCHANT, RENEWAL, UPSELL, CROSS_SELL, REACTIVATION.                               |
| stage                    | enum             | DISCOVERY, QUALIFICATION, PROPOSAL, NEGOTIATION, CONTRACTING, CLOSED_WON, CLOSED_LOST. |
| expected_monthly_volume  | numeric          | Volumen mensual financiado estimado.                                                   |
| expected_mdr_rate        | numeric          | MDR esperado.                                                                          |
| expected_monthly_revenue | numeric          | Ingreso mensual estimado.                                                              |
| probability              | numeric          | Probabilidad de cierre.                                                                |
| expected_close_date      | date             | Fecha esperada de cierre.                                                              |
| loss_reason              | varchar nullable | Motivo si se pierde.                                                                   |

### `commercial_activities`

Actividades de CRM: llamadas, visitas, correos, reuniones, demos, tareas.

### `commercial_proposals`

Cotizaciones/propuestas enviadas al comercio.

### `proposal_lines`

Detalle de productos y precios: MDR, suscripción, setup, API, campañas.

### `approval_requests`

Aprobaciones por excepciones comerciales.

---

## 3. Contratos y pricing B2B

### `b2b_contracts`

Contrato marco con el comercio.

Campos: `id`, `account_id`, `contract_number`, `status`, `start_date`, `end_date`, `billing_cycle`, `settlement_policy`, `signed_at`, `terminated_at`.

### `contract_versions`

Versionado contractual. Nunca se sobrescriben condiciones históricas.

Campos: `id`, `contract_id`, `version_number`, `valid_from`, `valid_to`, `status`, `document_url`, `approved_by_user_id`.

### `commercial_terms`

Condiciones comerciales vigentes por versión contractual.

Campos principales:

- `id`
- `contract_version_id`
- `term_type`: MDR, SUBSCRIPTION, SETUP_FEE, SERVICE_FEE, PENALTY, MINIMUM_MONTHLY_FEE
- `rate_percent`
- `fixed_amount`
- `currency`
- `billing_timing`: PER_TRANSACTION, MONTHLY, ONE_TIME, ON_DEMAND
- `min_amount`, `max_amount`
- `applies_from`, `applies_to`

### `mdr_rules`

Reglas específicas de MDR.

Campos: `contract_version_id`, `product_category`, `branch_id`, `risk_segment`, `rate_percent`, `min_fee_amount`, `max_fee_amount`.

---

## 4. Onboarding y operación de comercio

### `merchant_branches`

Sucursales operativas.

Campos: `id`, `account_id`, `name`, `city`, `address`, `status`, `can_originate_bnpl`, `activated_at`.

### `merchant_users`

Usuarios del portal del comercio.

Campos: `id`, `account_id`, `branch_id`, `email`, `role`, `status`, `last_login_at`.

### `merchant_onboarding_cases`

Caso de implementación de comercio.

### `onboarding_checklist_items`

Checklist operativo/legal/técnico.

---

## 5. Integración con Core BNPL

Estas tablas pueden vivir en otro bounded context, pero deben relacionarse por claves.

### `consumers`

Usuario final del crédito. No es cliente del CRM B2B.

### `consumer_credit_lines`

Línea de crédito del consumidor.

### `bnpl_purchases`

Compra financiada en comercio.

Campos importantes para ventas/finanzas:

- `merchant_account_id`
- `branch_id`
- `consumer_id`
- `contract_version_id`
- `purchase_amount`
- `down_payment_amount`
- `financed_amount`
- `risk_tier_at_origination`
- `cohort_id`
- `status`

### `bnpl_installments`

Cuotas del 40% financiado.

### `consumer_payments_to_merchant`

Evidencia de pagos que el consumidor hace directamente al comercio.

---

## 6. Facturación B2B, CxC comercial y pagos

### `merchant_invoices`

Factura comercial B2B emitida al comercio.

| Campo            | Tipo             | Descripción                                              |
| ---------------- | ---------------- | -------------------------------------------------------- |
| id               | uuid PK          | Factura B2B.                                             |
| account_id       | uuid FK          | Comercio facturado.                                      |
| contract_id      | uuid FK          | Contrato relacionado.                                    |
| invoice_number   | varchar unique   | Número interno/fiscal.                                   |
| invoice_date     | date             | Fecha emisión.                                           |
| due_date         | date             | Vencimiento.                                             |
| subtotal_amount  | numeric          | Subtotal.                                                |
| tax_amount       | numeric          | Impuesto.                                                |
| total_amount     | numeric          | Total.                                                   |
| status           | enum             | DRAFT, ISSUED, PARTIALLY_PAID, PAID, OVERDUE, CANCELLED. |
| external_tax_ref | varchar nullable | CUF/CUFD/ERP si aplica.                                  |

### `merchant_invoice_lines`

Detalle: MDR por periodo, suscripción, setup fee, API, penalidad.

### `merchant_receivables`

CxC comercial contra comercio.

No representa cuotas del consumidor. Representa ingresos de ATLAS contra el comercio.

Campos: `id`, `account_id`, `invoice_id`, `source_type`, `source_id`, `amount_original`, `amount_open`, `currency`, `issued_at`, `due_date`, `status`.

### `merchant_payments`

Pagos del comercio a ATLAS.

### `merchant_payment_allocations`

Aplicación de pagos contra CxC/facturas.

### `merchant_credit_notes`

Notas de crédito a comercio por ajustes de facturación comercial.

---

## 7. CxP de ATLAS hacia comercio por cobertura

### `merchant_payables`

Obligaciones de ATLAS con el comercio.

Nacen cuando el consumidor no paga una cuota y ATLAS debe cubrir esa cuota al comercio.

Campos:

- `id`
- `account_id`
- `purchase_id`
- `installment_id`
- `reason`: CUSTOMER_INSTALLMENT_DEFAULT_COVERAGE, SETTLEMENT_ADJUSTMENT, REFUND_ADJUSTMENT
- `amount`
- `scheduled_payment_date`
- `paid_at`
- `status`: SCHEDULED, DUE, PAID, CANCELLED, DISPUTED

---

## 8. Recuperación contra consumidor

### `consumer_recovery_receivables`

CxC contra consumidor después de cobertura.

Campos:

- `id`
- `consumer_id`
- `purchase_id`
- `installment_id`
- `merchant_payable_id`
- `amount_covered_by_atlas`
- `amount_recovered`
- `coverage_paid_at`
- `recovery_status`
- `days_past_due`

---

## 9. Conciliación y auditoría

### `reconciliation_runs`

Ejecución de conciliación por periodo.

### `reconciliation_items`

Diferencias detectadas.

### `audit_logs`

Bitácora de cambios críticos: pricing, contratos, facturas, pagos, activación de comercio.

---

## Cardinalidades resumidas

| Relación                                              |                 Cardinalidad |
| ----------------------------------------------------- | ---------------------------: |
| `b2b_accounts` → `b2b_contacts`                       |                          1:N |
| `b2b_accounts` → `sales_opportunities`                |                          1:N |
| `sales_opportunities` → `commercial_proposals`        |                          1:N |
| `commercial_proposals` → `proposal_lines`             |                          1:N |
| `b2b_accounts` → `b2b_contracts`                      |                          1:N |
| `b2b_contracts` → `contract_versions`                 |                          1:N |
| `contract_versions` → `commercial_terms`              |                          1:N |
| `b2b_accounts` → `merchant_branches`                  |                          1:N |
| `b2b_accounts` → `bnpl_purchases`                     |                          1:N |
| `bnpl_purchases` → `bnpl_installments`                |                          1:N |
| `b2b_accounts` → `merchant_invoices`                  |                          1:N |
| `merchant_invoices` → `merchant_invoice_lines`        |                          1:N |
| `merchant_invoices` → `merchant_receivables`          |     1:N o 1:1 según política |
| `merchant_payments` → `merchant_payment_allocations`  |                          1:N |
| `bnpl_installments` → `merchant_payables`             |   0:1 o 1:1 si hay cobertura |
| `merchant_payables` → `consumer_recovery_receivables` | 0:1 o 1:1 después de pagarse |

---

## Índices recomendados

- `b2b_accounts(tax_id)` unique nullable filtrado.
- `sales_opportunities(account_id, stage, expected_close_date)`.
- `b2b_contracts(account_id, status)`.
- `contract_versions(contract_id, valid_from, valid_to)`.
- `bnpl_purchases(merchant_account_id, purchase_date, status)`.
- `bnpl_installments(purchase_id, due_date, status)`.
- `merchant_invoices(account_id, invoice_date, status)`.
- `merchant_receivables(account_id, due_date, status)`.
- `merchant_payables(account_id, scheduled_payment_date, status)`.
- `consumer_recovery_receivables(consumer_id, recovery_status)`.

---

## Reglas de integridad críticas

1. Una compra BNPL debe guardar el `contract_version_id` vigente al momento de la venta.
2. El MDR debe calcularse con condiciones históricas, nunca con el contrato actual si fue renegociado luego.
3. `consumer_recovery_receivables` no puede existir si `merchant_payable.status` no está `PAID` o al menos aprobado como cobertura, según política.
4. `merchant_receivables.source_type = MDR` debe apuntar a una compra/corte/factura, no a una cuota de consumidor.
5. Un comercio no puede originar BNPL si no tiene contrato activo y onboarding completo.
6. Toda excepción de MDR debe tener aprobación auditable.
