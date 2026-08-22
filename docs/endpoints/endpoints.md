# Endpoints del backend integrado ATLAS

Todos los endpoints se exponen bajo el prefijo global configurado por `API_GLOBAL_PREFIX`, por defecto `/api/v1`.

La autenticación integrada acepta JWT Bearer con payload compatible con los tres módulos: `roleCode`, `role`, `roles` y, para contabilidad, `legalEntityIds`.

# Endpoints integrados - CRM / Ventas B2B

# Endpoints — ATLAS CRM/Ventas B2B

Todos los endpoints usan el prefijo global `api/v1`. Todos los endpoints de negocio requieren `Authorization: Bearer <token>` con payload mínimo `{ sub, roleCode }`.

## GET /api/v1/health

### Responsabilidad

Verifica que el servidor HTTP está activo.

### Autenticación

No requiere.

### Respuesta exitosa

```json
{ "success": true, "data": { "status": "ok", "service": "atlas-integrated-backend" } }
```

## GET /api/v1/ready

### Responsabilidad

Valida disponibilidad de dependencias críticas, especialmente PostgreSQL.

### Autenticación

No requiere.

## POST /api/v1/b2b/accounts

### Responsabilidad

Registra un comercio/cuenta B2B como `LEAD` y crea su contacto principal.

### Roles

`COMMERCIAL_EXECUTIVE`, `COMMERCIAL_MANAGER`, `ADMIN`.

### Guards, pipes e interceptors

- `JwtAuthGuard`
- `RolesGuard`
- `ZodValidationPipe(createAccountSchema)`
- `ResponseInterceptor`

### Body

```json
{
  "legalName": "Comercial Demo S.R.L.",
  "tradeName": "Comercial Demo",
  "taxId": "123456789",
  "accountType": "MERCHANT",
  "industry": "Retail",
  "ownerUserId": "00000000-0000-0000-0000-000000000002",
  "territoryId": "10000000-0000-0000-0000-000000000001",
  "primaryContact": {
    "fullName": "Ana Pérez",
    "email": "ana@example.com",
    "phone": "+59170000000",
    "decisionRole": "DECISION_MAKER"
  }
}
```

### Errores esperados

- `400 VALIDATION_ERROR`: body inválido.
- `401 UNAUTHORIZED`: token ausente o inválido.
- `403 FORBIDDEN`: rol insuficiente.
- `409 UNIQUE_CONSTRAINT_ERROR`: NIT o nombre duplicado.

## GET /api/v1/b2b/accounts

### Responsabilidad

Lista cuentas B2B con paginación, filtro por estado y búsqueda segura.

### Query

`page`, `limit`, `status`, `search`, `sortBy`, `sortOrder`.

### Roles

`COMMERCIAL_EXECUTIVE`, `COMMERCIAL_MANAGER`, `FINANCE`, `LEGAL`, `OPERATIONS`, `ADMIN`.

## GET /api/v1/b2b/accounts/:id

### Responsabilidad

Obtiene una cuenta B2B con contactos.

## POST /api/v1/b2b/accounts/:accountId/contacts

### Responsabilidad

Agrega un contacto corporativo a una cuenta B2B.

## POST /api/v1/b2b/accounts/:accountId/qualify

### Responsabilidad

Califica o descalifica una cuenta. Si califica, opcionalmente crea oportunidad comercial.

### Regla aplicada

Una cuenta descalificada no debe avanzar comercialmente sin reapertura aprobada.

### Body

```json
{
  "hasCommercialFit": true,
  "createOpportunity": true,
  "opportunity": {
    "name": "Implementación BNPL retail",
    "opportunityType": "NEW_MERCHANT",
    "expectedMonthlyVolume": 150000,
    "expectedMdrRate": 3.5,
    "probability": 45,
    "expectedCloseDate": "2026-08-30"
  }
}
```

## POST /api/v1/b2b/opportunities

### Responsabilidad

Crea una oportunidad comercial asociada a una cuenta.

### Regla aplicada

No permite crear oportunidades para cuentas `DISQUALIFIED`.

## PATCH /api/v1/b2b/opportunities/:id/stage

### Responsabilidad

Mueve etapa de pipeline comercial.

### Regla aplicada

No permite pasar a `CONTRACTING` sin propuesta aceptada.

## POST /api/v1/b2b/proposals

### Responsabilidad

Crea una propuesta comercial con líneas MDR, suscripción, setup fee, servicios o penalidades.

### Regla aplicada

Si una línea MDR está por debajo de `DEFAULT_MIN_MDR_RATE_PERCENT`, se crea `approval_request` y la propuesta queda `PENDING_APPROVAL`.

### Body mínimo

```json
{
  "opportunityId": "uuid",
  "proposalNumber": "PROP-2026-001",
  "validUntil": "2026-08-31",
  "pricingExceptionReason": "Volumen comprometido alto",
  "lines": [
    {
      "termType": "MDR",
      "description": "MDR BNPL estándar",
      "ratePercent": 2.2,
      "currency": "BOB",
      "billingTiming": "PER_TRANSACTION"
    }
  ]
}
```

## PATCH /api/v1/b2b/proposals/:proposalId/send

### Responsabilidad

Envía propuesta al comercio.

### Regla aplicada

Bloquea envío si existen aprobaciones pendientes.

## PATCH /api/v1/b2b/proposals/:proposalId/accept

### Responsabilidad

Marca propuesta como aceptada y mueve oportunidad a `CONTRACTING`.

## PATCH /api/v1/b2b/proposals/:proposalId/reject

### Responsabilidad

Rechaza propuesta y registra fecha de rechazo.

## PATCH /api/v1/b2b/proposals/approvals/:id/decision

### Responsabilidad

Aprueba o rechaza una excepción comercial.

### Roles

`COMMERCIAL_MANAGER`, `FINANCE`, `ADMIN`.

## POST /api/v1/b2b/contracts/from-proposal

### Responsabilidad

Crea contrato y versión contractual inicial desde una propuesta aceptada.

### Regla aplicada

Las condiciones se copian a `commercial_terms` para preservar histórico.

## PATCH /api/v1/b2b/contracts/:contractId/sign-and-activate

### Responsabilidad

Firma contrato y activa su versión contractual inicial.

## POST /api/v1/b2b/onboarding/cases

### Responsabilidad

Crea caso de onboarding con checklist legal/operativo/técnico.

## POST /api/v1/b2b/onboarding/branches

### Responsabilidad

Registra sucursal. Nace sin capacidad de originar BNPL hasta completar onboarding.

## POST /api/v1/b2b/onboarding/merchant-users

### Responsabilidad

Registra usuario corporativo del comercio.

## PATCH /api/v1/b2b/onboarding/cases/:onboardingCaseId/checklist

### Responsabilidad

Completa o marca ítems del checklist.

## PATCH /api/v1/b2b/onboarding/cases/:onboardingCaseId/activate

### Responsabilidad

Completa onboarding, cambia cuenta a `CUSTOMER` y activa sucursales pendientes.

### Reglas aplicadas

- Requiere checklist completo o waived.
- Requiere contrato activo.
- Activa sucursales con `can_originate_bnpl=true`.

## POST /api/v1/b2b/bnpl/purchases

### Responsabilidad

Registra compra BNPL originada por comercio activo y crea cargo MDR B2B.

### Reglas aplicadas

- Comercio debe estar `CUSTOMER`.
- Sucursal debe estar `ACTIVE` y `can_originate_bnpl=true`.
- Debe existir versión contractual activa en fecha de compra.
- El consumidor paga 60% directo al comercio.
- Se registra ese pago inicial en `consumer_payments_to_merchant` para no perder trazabilidad financiera-operativa.
- Se guarda `contract_version_id` histórico.
- Se crea `merchant_receivable` de tipo `MDR` contra comercio, no contra consumidor.

## POST /api/v1/b2b/billing/invoices

### Responsabilidad

Emite factura B2B desde cargos `merchant_receivables` abiertos.

### Regla aplicada

No factura dos veces el mismo cargo.

## POST /api/v1/b2b/billing/merchant-payments

### Responsabilidad

Registra pago del comercio y lo aplica explícitamente contra CxC B2B.

### Reglas aplicadas

- La suma de asignaciones no puede exceder el pago.
- Una asignación no puede exceder saldo abierto.
- Actualiza estado de CxC e invoice.

## POST /api/v1/b2b/coverage/payables

### Responsabilidad

Crea CxP ATLAS→comercio por una cuota impaga específica.

### Regla aplicada

No acelera toda la deuda; cubre cuota por cuota.

## PATCH /api/v1/b2b/coverage/payables/:payableId/paid

### Responsabilidad

Marca la CxP como pagada y recién entonces crea `consumer_recovery_receivable`.

### Regla aplicada

La recuperación contra consumidor no nace antes del pago/cobertura ATLAS.

## PATCH /api/v1/b2b/coverage/recoveries/:recoveryId/apply-payment

### Responsabilidad

Aplica recuperación parcial o total contra la CxC del consumidor.

## POST /api/v1/b2b/reconciliation/runs

### Responsabilidad

Ejecuta conciliación interna por periodo.

### Compara

- Compras confirmadas vs cargos MDR.
- CxC B2B vencidas.
- Cuotas vencidas vs CxP comercio.
- CxP pagadas vs recuperaciones consumidor.

# Endpoints integrados - Contabilidad

# Endpoints del módulo contable ATLAS

Todos los endpoints privados usan:

```http
Authorization: Bearer <jwt>
```

## Health

### GET /api/v1/health

Público. Verifica que la aplicación esté activa.

### GET /api/v1/ready

Público. Verifica conexión a base de datos.

## Estructura financiera

### POST /api/v1/accounting/financial-structure/legal-entities

Crea una entidad legal.

Roles: `admin`, `accountant`, `cfo`.

Body mínimo:

```json
{
  "code": "ATLAS-BO",
  "legalName": "ATLAS Bolivia S.A.",
  "taxId": "123456789",
  "countryCode": "BO",
  "baseCurrency": "BOB",
  "timezone": "America/La_Paz"
}
```

### POST /api/v1/accounting/financial-structure/branches

Crea una sucursal.

### POST /api/v1/accounting/financial-structure/fiscal-years

Crea un año fiscal.

### POST /api/v1/accounting/financial-structure/periods

Crea un período contable.

### POST /api/v1/accounting/financial-structure/ledgers

Crea un ledger local, management o IFRS.

### POST /api/v1/accounting/financial-structure/charts-of-accounts

Crea una versión de plan de cuentas.

### POST /api/v1/accounting/financial-structure/gl-accounts

Crea una cuenta contable.

### GET /api/v1/accounting/financial-structure/gl-accounts?page=1&pageSize=20

Lista cuentas contables con paginación.

### POST /api/v1/accounting/financial-structure/tax-codes

Crea un código tributario.

## Business Partners

### POST /api/v1/accounting/business-partners

Crea una contraparte única.

### POST /api/v1/accounting/business-partners/roles

Agrega rol a un business partner.

### GET /api/v1/accounting/business-partners?page=1&pageSize=20

Lista business partners.

## Contratos

### POST /api/v1/accounting/contracts

Crea contrato base.

### POST /api/v1/accounting/contracts/terms

Agrega término versionable al contrato.

## Documentos contables

### POST /api/v1/accounting/documents

Crea documento contable en `DRAFT`.

Validaciones:

- período abierto.
- al menos dos líneas.
- cada línea con débito o crédito, pero no ambos.
- total débito = total crédito.

### PATCH /api/v1/accounting/documents/{id}/post

Publica un documento `DRAFT`.

Errores esperados:

- `404 ACCOUNTING_DOCUMENT_NOT_FOUND`
- `409 ACCOUNTING_DOCUMENT_NOT_DRAFT`
- `409 ACCOUNTING_PERIOD_CLOSED`
- `400 UNBALANCED_JOURNAL`

### POST /api/v1/accounting/documents/{id}/reverse

Crea y publica documento de reverso.

### GET /api/v1/accounting/documents/{id}

Devuelve cabecera, journal y líneas.

## Billing / AR

### POST /api/v1/accounting/billing/events

Registra evento facturable.

### POST /api/v1/accounting/billing/ar-invoices

Emite factura AR y genera asiento automático.

## Recibos

### POST /api/v1/accounting/receipts

Registra recibo, aplica cobros y genera asiento automático.

## Cierres

### POST /api/v1/accounting/closings/periods/close

Cierra período si no hay documentos `DRAFT`.

### PATCH /api/v1/accounting/closings/periods/reopen

Reabre período con motivo documentado.

## Endurecimiento transversal aplicado a endpoints contables

Todos los endpoints protegidos del módulo contable quedan bajo JWT Bearer y roles. Además, las operaciones que generan posting aplican las siguientes validaciones antes de persistir:

- período abierto;
- fecha de contabilización dentro del período;
- ledger activo de la misma entidad legal;
- cuentas GL activas;
- dimensiones obligatorias según cuenta;
- cuentas de control solo con referencia de submayor;
- doble partida;
- outbox transaccional.

### Cambios relevantes por endpoint

- `POST /api/v1/accounting/documents`: ahora ejecuta `SapPostingValidationService` además de `DoubleEntryValidator`.
- `POST /api/v1/accounting/billing/ar-invoices`: ahora valida rol BP, contrato, impuestos y trazabilidad SIAT cuando el documento fiscal está aceptado.
- `POST /api/v1/accounting/receipts`: ahora valida suma exacta de asignaciones, saldo abierto AR y actualiza estado de facturas.
- `POST /api/v1/accounting/closings/periods/close`: ahora bloquea cierre por documentos DRAFT, conciliaciones abiertas o extractos bancarios sin matching aprobado.

## Correcciones de hardening aplicadas en esta revisión

### Autorización por entidad legal

Las operaciones que reciben o derivan `legalEntityId` ahora validan alcance por entidad legal. El token JWT puede incluir:

```json
{
  "sub": "user-id",
  "role": "accountant",
  "legalEntityIds": ["uuid-entidad"]
}
```

`admin` mantiene acceso global. Los demás roles necesitan `legalEntityIds`; si falta, el sistema devuelve `403 LEGAL_ENTITY_SCOPE_REQUIRED`.

### Reversos

`POST /api/v1/accounting/documents/{id}/reverse` ahora:

1. bloquea el documento original en transacción;
2. rechaza reversos sobre documentos no `POSTED`;
3. rechaza doble reversión con `ACCOUNTING_DOCUMENT_ALREADY_REVERSED`;
4. crea documento reverso;
5. publica el reverso;
6. marca el documento original como `REVERSED` y conserva hash/líneas inmutables.

### Recibos

`POST /api/v1/accounting/receipts` agrupa asignaciones por factura y bloquea cada factura AR con `FOR UPDATE`. Esto evita que dos requests simultáneos apliquen cobros por encima del saldo abierto.

### Cierres

`POST /api/v1/accounting/closings/periods/close` ahora valida que el `periodId` pertenezca realmente a `legalEntityId` antes de crear `close_run`.

### Errores Sequelize/PostgreSQL

Los errores de constraints se normalizan:

- Unique constraint → `409 UNIQUE_CONSTRAINT_VIOLATION`.
- Foreign key → `409 FOREIGN_KEY_CONSTRAINT_VIOLATION`.
- Check constraint → `400 DATABASE_CHECK_CONSTRAINT_VIOLATION`.

## Workers

### Worker Outbox

```bash
npm run build
npm run worker:outbox
```

Procesa `atlas_accounting.event_outbox`, usa `FOR UPDATE SKIP LOCKED` y marca `published_at` después de publicar el evento.

# Endpoints integrados - Publicidad externa

# Endpoints — ATLAS Ads

Base API: `/api/v1`.

Todas las respuestas exitosas se normalizan como:

```json
{
  "success": true,
  "requestId": "uuid",
  "data": {}
}
```

Los errores se normalizan como:

```json
{
  "success": false,
  "requestId": "uuid",
  "error": {
    "code": "ERROR_CODE",
    "message": "Mensaje seguro",
    "details": []
  }
}
```

La autenticación privada usa JWT Bearer interno ATLAS. El token debe incluir `sub`, `roles`, `tokenType=internal_access|service_access`, `iss=atlas-internal` y `aud=atlas-ads` salvo que se cambien las variables de entorno.

## GET /api/v1/health

### Responsabilidad

Confirma que el servidor HTTP está vivo.

### Autenticación

Público.

## GET /api/v1/ready

### Responsabilidad

Verifica readiness de dependencias críticas, incluyendo conexión Sequelize/PostgreSQL.

### Autenticación

Público.

## GET /api/v1/admin/ads/dashboard

### Responsabilidad

Muestra salud global del módulo publicitario: ingresos, spend, campañas activas, revisiones pendientes, facturas vencidas y eventos inválidos.

### Roles

`ADS_ADMIN_VIEWER`, `ADS_ADMIN_MANAGER`, `ADS_ADMIN_OPERATOR`, `ADS_FINANCE`, `ADS_AUDITOR`, `ADS_SUPER_ADMIN`.

### Query

`from`, `to`, `advertiserId`, `placementId`, `status`.

### Validaciones

- `from` y `to` deben tener formato `YYYY-MM-DD`.
- `to` no puede ser anterior a `from`.

## GET /api/v1/admin/ads/advertisers

Lista anunciantes externos con paginación.

### Roles

`ADS_ADMIN_VIEWER`, `ADS_ADMIN_MANAGER`, `ADS_FINANCE`, `ADS_AUDITOR`.

### Query

`page`, `limit`, `status`, `riskStatus`, `billingMode`, `search`.

## POST /api/v1/admin/ads/advertisers

Crea anunciante externo en estado `PENDING_REVIEW`.

### Roles

`ADS_ADMIN_MANAGER`.

### Body

```json
{
  "legalName": "Empresa Ejemplo SRL",
  "tradeName": "Marca Ejemplo",
  "taxId": "123456789",
  "businessCategory": "Retail",
  "country": "BO",
  "city": "Santa Cruz de la Sierra",
  "primaryContactName": "Responsable Comercial",
  "primaryContactEmail": "contacto@empresa.com",
  "billingMode": "POSTPAID"
}
```

### Reglas

- El NIT/tax ID es único por país.
- La verificación de duplicidad corre dentro de la misma transacción de alta.
- Toda alta genera `auditId`.

## POST /api/v1/admin/ads/advertisers/:advertiserId/billing-profiles

Crea perfil fiscal/facturación activo para un anunciante. Este endpoint existe porque el cierre de periodo depende de un perfil fiscal activo.

### Roles

`ADS_ADMIN_MANAGER`, `ADS_FINANCE`.

### Body

```json
{
  "fiscalName": "Empresa Ejemplo SRL",
  "taxId": "123456789",
  "billingEmail": "facturacion@empresa.com",
  "addressLine": "Av. Ejemplo #123",
  "country": "BO",
  "city": "Santa Cruz de la Sierra",
  "taxRegime": "REGIMEN_GENERAL",
  "sinCustomerCode": "CUST-123",
  "isDefault": true
}
```

### Reglas

- Si `isDefault=true`, los perfiles fiscales activos previos dejan de ser default.
- Toda creación genera auditoría de severidad alta.

## GET /api/v1/admin/ads/advertisers/:advertiserId

Detalle del anunciante: cuenta, perfiles fiscales, campañas recientes e invoices.

## PATCH /api/v1/admin/ads/advertisers/:advertiserId/status

Actualiza estado/riesgo del anunciante.

### Roles

`ADS_ADMIN_MANAGER`.

### Body

```json
{
  "status": "SUSPENDED",
  "riskStatus": "WATCHLIST",
  "reason": "Factura vencida por más de 15 días"
}
```

### Errores esperados

- `404 ADVERTISER_NOT_FOUND`.
- `409 INVALID_ADVERTISER_TRANSITION`.

## GET /api/v1/admin/ads/campaigns

Lista campañas globales con filtros por anunciante, estado, aprobación y fecha.

### Validaciones

- `from` y `to` no pueden estar invertidos.
- `page` y `limit` son obligatorios por default y con límite máximo 100.

## GET /api/v1/admin/ads/campaigns/:campaignId

Detalle de campaña con advertiser, ad sets, ads y creatives.

## PATCH /api/v1/admin/ads/campaigns/:campaignId/status

Pausa, finaliza, activa o archiva campaña con motivo obligatorio.

### Body

```json
{
  "status": "PAUSED",
  "reason": "Pausa preventiva por reclamo de compliance"
}
```

### Reglas

- No se activa una campaña sin `approvalStatus=APPROVED`.
- No se reactiva una campaña `ENDED` o `ARCHIVED`.
- Toda mutación genera `auditId`.

## GET /api/v1/admin/ads/moderation/queue

Lista revisiones de moderación por estado.

### Roles

`ADS_MODERATOR`, `ADS_COMPLIANCE_ADMIN`, lectura admin/auditor.

## POST /api/v1/admin/ads/moderation/:reviewId/decision

Registra decisión de moderación y propaga estado a campaña/anuncio/creative.

### Body

```json
{
  "reviewStatus": "APPROVED",
  "reasonCode": "POLICY_OK",
  "notes": "Cumple formato, URL y política de claims.",
  "requiresAdvertiserChanges": false
}
```

### Reglas

- No se puede decidir una revisión que ya no está en `PENDING_REVIEW`.
- `PENDING_REVIEW` no es una decisión final válida.

## GET /api/v1/admin/ads/inventory

Lista placements.

## POST /api/v1/admin/ads/inventory

Crea placement administrable.

### Body

```json
{
  "placementCode": "MERCHANT_DASHBOARD_TOP_BANNER",
  "surface": "MERCHANT_PORTAL",
  "allowedFormats": ["IMAGE_BANNER"],
  "floorPriceMicros": 2500000,
  "billingModel": "CPM",
  "status": "ACTIVE"
}
```

## GET /api/v1/admin/ads/policies

Lista reglas de política publicitaria.

## POST /api/v1/admin/ads/policies

Crea política publicitaria.

### Body

```json
{
  "policyCode": "NO_UNVERIFIED_FINANCIAL_CLAIMS",
  "category": "FINANCIAL_CLAIMS",
  "ruleType": "MANUAL_REVIEW_REQUIRED",
  "severity": "HIGH",
  "isActive": true
}
```

## POST /api/v1/admin/ads/billing/period-close

Genera facturas `DRAFT` desde `ad_spend_ledger`.

### Roles

`ADS_FINANCE`.

### Body

```json
{
  "periodStart": "2026-07-01",
  "periodEnd": "2026-07-31",
  "advertiserId": "uuid opcional"
}
```

### Reglas endurecidas

- El periodo no puede estar invertido.
- Agrupa por anunciante y moneda, no genera una factura por campaña.
- Cada campaña queda como línea de factura.
- No permite cerrar dos veces el mismo periodo para el mismo anunciante/moneda si existe factura no anulada.
- Requiere perfil fiscal activo.

## POST /api/v1/admin/ads/invoices/:invoiceId/payments

Registra pago y actualiza estado de factura.

### Reglas endurecidas

- No permite pagar facturas `VOID` o `PAID`.
- No permite moneda distinta a la factura.
- No permite sobrepago.

## GET /api/v1/admin/ads/delivery-monitor

Devuelve KPIs de delivery y eventos paginados.

## PATCH /api/v1/admin/ads/events/:eventId/billable-status

Marca evento como facturable/no facturable con motivo y auditoría.

### Reglas endurecidas

- Si un evento deja de ser facturable, se registra crédito compensatorio y se libera presupuesto de campaña.
- Si vuelve a ser facturable, se reserva presupuesto antes de generar cargo/ajuste.
- No se cambia facturación sin `reason`.

## GET /api/v1/admin/ads/audit

Consulta bitácora por entidad, actor, fecha y severidad.

## POST /api/v1/ads/delivery/select

Endpoint interno del Ad Server.

### Roles

`ADS_AD_SERVER`.

### Reglas

- Solo entrega campañas/anuncios activos y aprobados.
- Respeta estado del anunciante y `riskStatus`.
- Respeta presupuesto total.
- Respeta frequency cap cuando se envía `corporateClientHash`.

## POST /api/v1/ads/events

Endpoint interno del motor de eventos.

### Roles

`ADS_EVENT_TRACKER`, `ADS_AD_SERVER`.

### Reglas endurecidas

- Idempotencia por `deliveryDecisionId + eventType + requestId`.
- El presupuesto se reserva atómicamente antes de crear cargo facturable.
- Si no hay presupuesto, el evento se registra como no facturable con metadata `billingSkippedReason=BUDGET_EXHAUSTED`.
- El ledger se genera solo para eventos facturables.

### Body

```json
{
  "eventType": "IMPRESSION",
  "deliveryDecisionId": "uuid",
  "requestId": "uuid",
  "fraudScore": 0.1,
  "metadata": {}
}
```

---

# Endpoints adicionales de endurecimiento: acciones multi-tabla, business action log y BULK

## POST /api/v1/b2b/accounts/bulk

### Responsabilidad

Crea múltiples cuentas B2B con su contacto principal en una sola operación transaccional.

### Autenticación

Requiere JWT.

### Roles

`COMMERCIAL_MANAGER`, `ADMIN`.

### Guards, pipes e interceptors aplicados

- `JwtAuthGuard`
- `RolesGuard`
- `ZodValidationPipe(bulkCreateAccountsSchema)`
- `ResponseInterceptor`
- `LoggingInterceptor`

### Entrada esperada

```json
{
  "batchExternalId": "BATCH-B2B-2026-001",
  "items": [
    {
      "legalName": "Empresa Uno SRL",
      "tradeName": "Empresa Uno",
      "taxId": "123456789",
      "accountType": "MERCHANT",
      "primaryContact": {
        "fullName": "Contacto Principal",
        "email": "contacto@empresa.com"
      }
    }
  ]
}
```

### Validaciones

- `items` debe contener entre 1 y 100 registros.
- No permite `taxId` duplicado dentro del mismo batch.
- No permite `tradeName` duplicado dentro del mismo batch.
- Reutiliza la validación individual de `createAccountSchema`.

### Impacto multi-tabla

Este endpoint no es CRUD plano. En una única transacción crea registros en:

- `b2b_sales.b2b_accounts`
- `b2b_sales.b2b_contacts`
- `b2b_sales.audit_logs`
- `atlas_audit.business_action_logs`

### Business action log

Registra `BULK_CREATE_ACCOUNTS_WITH_PRIMARY_CONTACTS` con correlación por `batchExternalId`, actor, tablas impactadas y cantidad de registros afectados.

## POST /api/v1/accounting/documents/bulk

### Responsabilidad

Crea múltiples documentos contables en borrador con asientos y líneas en una sola operación transaccional.

### Autenticación

Requiere JWT.

### Roles

`admin`, `accountant`, `cfo`.

### Entrada esperada

```json
{
  "batchExternalId": "BATCH-ACC-2026-001",
  "items": [
    {
      "legalEntityId": "uuid",
      "sourceSystem": "MANUAL",
      "sourceType": "ADJUSTMENT",
      "sourceId": "ADJ-001",
      "documentType": "MANUAL",
      "documentNo": "DOC-001",
      "documentDate": "2026-07-01T00:00:00.000Z",
      "postingDate": "2026-07-01T00:00:00.000Z",
      "accountingPeriodId": "uuid",
      "ledgerId": "uuid",
      "currencyCode": "BOB",
      "lines": [
        {
          "glAccountId": "uuid",
          "debit": 100,
          "credit": 0,
          "currencyCode": "BOB",
          "amountLc": 100
        },
        { "glAccountId": "uuid", "debit": 0, "credit": 100, "currencyCode": "BOB", "amountLc": 100 }
      ]
    }
  ]
}
```

### Validaciones

- `items` debe contener entre 1 y 50 documentos.
- Cada documento reutiliza `createAccountingDocumentSchema`.
- Cada documento debe cuadrar doble partida.
- No permite `documentNo` duplicado por entidad legal dentro del batch.
- No permite clave de origen duplicada `sourceSystem + sourceType + sourceId` dentro del batch.

### Impacto multi-tabla

En una única transacción por batch impacta:

- `atlas_accounting.accounting_document`
- `atlas_accounting.journal_entry`
- `atlas_accounting.journal_entry_line`
- `atlas_accounting.document_audit_log`
- `atlas_accounting.event_outbox`
- `atlas_audit.business_action_logs`

### Business action log

Registra `BULK_CREATE_ACCOUNTING_DRAFTS_WITH_JOURNALS` y cada documento individual registra `CREATE_ACCOUNTING_DRAFT_WITH_JOURNAL`.

## POST /api/v1/admin/ads/advertisers/bulk

### Responsabilidad

Crea múltiples anunciantes externos administrativos en una sola operación transaccional.

### Roles

`ADS_ADMIN_MANAGER`.

### Validaciones

- `items` debe contener entre 1 y 100 anunciantes.
- Reutiliza `createAdvertiserSchema`.
- No permite `country + taxId` duplicado dentro del batch.
- Valida duplicidad contra base de datos antes de crear cada anunciante.

### Impacto multi-tabla

- `ad_advertiser_accounts`
- `ad_audit_log`
- `atlas_audit.business_action_logs`

### Business action log

Registra `BULK_CREATE_ADVERTISERS` con actor, requestId, batch y cantidad de registros afectados.

## POST /api/v1/ads/events/bulk

### Responsabilidad

Registra múltiples eventos publicitarios en modo batch, manteniendo idempotencia y creación atómica de ledger por evento facturable.

### Roles

`ADS_EVENT_TRACKER`, `ADS_AD_SERVER`.

### Validaciones

- `items` debe contener entre 1 y 500 eventos.
- Cada evento reutiliza `trackEventSchema`.
- Mantiene idempotencia por `deliveryDecisionId + eventType + requestId`.

### Impacto multi-tabla

- `ad_events`
- `ad_spend_ledger`
- `ad_campaigns`
- `atlas_audit.business_action_logs`

### Business action log

Registra `BULK_TRACK_AD_EVENTS_WITH_SPEND_LEDGER` con cantidad de eventos procesados y cargos creados.

## GET /api/v1/audit/business-actions

### Responsabilidad

Consulta transversal de acciones de negocio. No reemplaza Pino ni los audit logs específicos de cada módulo: permite auditar procesos de negocio, batches y operaciones que impactan múltiples tablas.

### Roles

`ADMIN`, `AUDITOR`, `ADS_AUDITOR`, `ADS_ADMIN_MANAGER`, `FINANCE`, `accountant`.

### Query soportado

```txt
page, pageSize, moduleCode, businessProcess, actionCode, status, aggregateType, aggregateId, actorUserId, correlationId, from, to
```

### Respuesta

Lista paginada de `business_action_logs` con actor, proceso, acción, tablas impactadas, cantidad de registros afectados, estado y fecha.

# Endpoints — Portal del comercio

Canal del usuario partner (`/api/v1/portal/*`). Documentación del módulo:
[`src/modules/portal/README.md`](../../src/modules/portal/README.md).

## Autenticación del comercio

El usuario partner se autentica contra **AtlasBackend**, que es donde vive su identidad
(`iam.merchant_users`), y este backend traduce esa sesión a su propio token de negocio:

| Método | Ruta                            | Responsabilidad                                            |
| ------ | ------------------------------- | ---------------------------------------------------------- |
| POST   | `/api/v1/auth/merchant/login`   | Inicia sesión de comercio y emite el token de este backend |
| POST   | `/api/v1/auth/merchant/refresh` | Rota la sesión upstream y reemite el token                 |
| POST   | `/api/v1/auth/merchant/logout`  | Cierra la sesión upstream (idempotente)                    |

El rol `merchant` de AtlasBackend se traduce a `MERCHANT_ADMIN`; un rol upstream que no se pueda
traducir se rechaza en el login (`401`) en vez de emitir una sesión sin permisos que fallaría
endpoint a endpoint.

Hasta esta versión, `MERCHANT_ADMIN` se fabricaba mapeándolo desde `MERCHANT_OPERATIONS`, que es un
rol **interno** de Atlas ("Operaciones de comercios"). Es decir: no existía la identidad del
comercio y el canal lo operaba, en realidad, personal interno. Ese mapeo ya no otorga
`MERCHANT_ADMIN`; el staff conserva `COMMERCIAL_EXECUTIVE`, que es lo que de verdad es.

El `sub` del token es un identificador opaco del proveedor de identidad (hoy, un bigint): este
backend lo guarda tal cual en `atlas_sales.merchant_users.user_id` y no presupone su formato.

**El token no da acceso a ninguna cuenta por sí solo.** El alcance se sigue resolviendo contra
`atlas_sales.merchant_users`: un comercio con token válido y sin membresía activa recibe
`403 PORTAL_SCOPE_NOT_PROVISIONED`.

## Modelo de autorización del portal

Todos los endpoints de esta sección resuelven primero el **alcance** del llamador con
`PortalScopeService`, consultando `atlas_sales.merchant_users` (no el JWT):

- `MERCHANT_ADMIN` (comercio, autenticado en `/auth/merchant/login`): opera únicamente sobre las
  cuentas donde tiene membresía `ACTIVE`.
  Los parámetros `merchantAccountId` / `accountId` / `advertiserId` son opcionales; si los envía,
  se validan contra su alcance. Sin membresía activa: `403 PORTAL_SCOPE_NOT_PROVISIONED`.
- `ADMIN`, `COMMERCIAL_MANAGER`, `COMMERCIAL_EXECUTIVE` (staff interno): operan en nombre de un
  comercio durante soporte u onboarding y **deben** indicar la cuenta
  (`400 MERCHANT_ACCOUNT_REQUIRED` si la omiten). Cada uso queda registrado como acceso delegado.

Errores transversales de alcance: `403 MERCHANT_ACCOUNT_FORBIDDEN`, `403 ADVERTISER_FORBIDDEN`.
Todos los listados son paginados (`page`, `limit`) con tope duro de 100 filas.

## GET /api/v1/portal/plans

### Responsabilidad

Cataloga los planes comerciales disponibles para el comercio.

### Roles

`MERCHANT_ADMIN`, `ADMIN`, `COMMERCIAL_MANAGER`, `COMMERCIAL_EXECUTIVE`.

### Query

```txt
page, limit, includeInactive ('true' | 'false', por defecto 'false')
```

## POST /api/v1/portal/plans

### Responsabilidad

Da de alta un plan comercial. Es dato maestro de precio: no lo toca el comercio.

### Roles

`ADMIN`, `COMMERCIAL_MANAGER`.

### Body

```txt
code (A-Z0-9_), name, description?, tier, monthlyPrice (2 decimales), currency (ISO-3), features[], sortOrder
```

### Errores esperados

- `409 MERCHANT_PLAN_CODE_TAKEN` si el código ya existe.
- `400` si el precio trae más de dos decimales (la columna es `numeric(18,2)`).

### Business action log

`MERCHANT_PLAN_ADMINISTRATION` / `CREATE_MERCHANT_PLAN`.

## GET /api/v1/portal/subscription

### Responsabilidad

Devuelve la suscripción vigente del comercio, con su plan y el fin del período en curso.

### Query

```txt
merchantAccountId?
```

## POST /api/v1/portal/subscription

### Responsabilidad

Contrata o cambia de plan: cierra la suscripción anterior (`REPLACED`) y abre la nueva en la misma
transacción, bajo lock de la cuenta.

### Body

```txt
merchantAccountId?, planId, autoRenew (por defecto true)
```

### Reglas aplicadas

- La cuenta debe estar en estado contratable (`QUALIFIED`, `CUSTOMER`); si no,
  `409 MERCHANT_ACCOUNT_NOT_SUBSCRIBABLE`.
- El plan debe existir y estar `ACTIVE`; si no, `404 MERCHANT_PLAN_NOT_AVAILABLE`.
- Reintentar el mismo plan con la misma renovación es idempotente: no genera una suscripción nueva.
- El fin de período se calcula sin desbordar de mes (31-ene → 28/29-feb).

### Impacto multi-tabla

- `atlas_sales.merchant_subscriptions`
- `atlas_audit.business_action_logs`

### Business action log

`MERCHANT_SUBSCRIPTION` / `SELECT_MERCHANT_PLAN` o `CHANGE_MERCHANT_PLAN`.

## GET /api/v1/portal/branches

### Responsabilidad

Lista las sucursales del comercio.

### Query

```txt
page, limit, accountId?
```

## GET /api/v1/portal/billing

### Responsabilidad

Panel de facturación del comercio: facturas y cobros recientes más los totales facturado y
pendiente.

### Query

```txt
merchantAccountId?
```

### Regla aplicada

Los totales se agregan en SQL sobre el universo completo de documentos y se devuelven como decimal
exacto; la lista de documentos viene acotada a los 50 más recientes. Los totales no se derivan de
la lista truncada.

## GET /api/v1/portal/advertisers

### Responsabilidad

Lista los anunciantes publicitarios de las cuentas del comercio.

### Query

```txt
page, limit, merchantAccountId?
```

### Regla aplicada

Proyección explícita: no se exponen `taxId`, `creditLimitMicros` ni el contacto interno del
anunciante.

## GET /api/v1/portal/campaigns

### Responsabilidad

Lista las campañas de un anunciante propio, indicando cuáles puede alternar el comercio.

### Query

```txt
page, limit, advertiserId (obligatorio)
```

### Errores esperados

- `403 ADVERTISER_FORBIDDEN` si el anunciante no pertenece al alcance del llamador.

## PATCH /api/v1/portal/campaigns/:id/status

### Responsabilidad

Prende o apaga una campaña propia. Única mutación del portal sobre un agregado facturable de
publicidad.

### Body

```txt
status ('ACTIVE' | 'PAUSED'), reason? (8 a 500 caracteres)
```

### Reglas aplicadas

- Propiedad del anunciante verificada antes de cualquier lectura de negocio.
- Anunciante `ACTIVE` y no bloqueado por riesgo (`ADVERTISER_NOT_ACTIVE`, `ADVERTISER_RISK_BLOCKED`).
- Solo campañas ya lanzadas (`CAMPAIGN_NOT_TOGGLEABLE`); el alta y la edición siguen siendo internas.
- Invariantes compartidas con la consola administrativa: nunca activar sin aprobación de moderación
  (`CAMPAIGN_NOT_APPROVED`) ni reactivar una campaña terminal (`INVALID_CAMPAIGN_TRANSITION`).
- Al reactivar: presupuesto no agotado (`CAMPAIGN_BUDGET_EXHAUSTED`) y campaña dentro de su ventana
  de vigencia.
- La fila se bloquea (`LOCK UPDATE`) y la operación es idempotente si el estado ya es el pedido.

### Impacto multi-tabla

- `ad_campaigns`
- `ad_audit_log`
- `atlas_audit.business_action_logs`

### Business action log

`MERCHANT_CAMPAIGN_CONTROL` / `PORTAL_UPDATE_CAMPAIGN_STATUS`, con estado previo y posterior.
