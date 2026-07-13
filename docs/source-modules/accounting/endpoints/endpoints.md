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
