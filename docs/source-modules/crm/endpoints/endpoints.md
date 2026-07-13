# Endpoints — ATLAS CRM/Ventas B2B

Todos los endpoints usan el prefijo global `api/v1`. Todos los endpoints de negocio requieren `Authorization: Bearer <token>` con payload mínimo `{ sub, roleCode }`.

## GET /api/v1/health

### Responsabilidad

Verifica que el servidor HTTP está activo.

### Autenticación

No requiere.

### Respuesta exitosa

```json
{ "success": true, "data": { "status": "ok", "service": "atlas-b2b-crm-ventas-api" } }
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
