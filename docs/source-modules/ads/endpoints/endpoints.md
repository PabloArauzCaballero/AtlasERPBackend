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
