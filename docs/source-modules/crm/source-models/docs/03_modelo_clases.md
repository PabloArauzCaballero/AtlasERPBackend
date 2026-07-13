# Modelo de clases de dominio — CRM/Ventas B2B ATLAS

## Bounded contexts recomendados

1. **SalesCRM**: cuentas, contactos, oportunidades, actividades y propuestas.
2. **CommercialContracting**: contratos, versiones, términos comerciales y aprobaciones.
3. **MerchantOnboarding**: sucursales, usuarios corporativos y checklist operativo.
4. **B2BBilling**: facturas, líneas, CxC comercial, pagos, notas de crédito.
5. **BNPLCoreLink**: compra, cuotas, pagos consumidor→comercio, cobertura ATLAS→comercio, recuperación.
6. **ReconciliationAudit**: conciliación y auditoría.

---

## Clases principales

### `B2BAccount`

Representa un cliente corporativo/comercio aliado.

Responsabilidades:

- Mantener identidad corporativa.
- Conocer estado comercial.
- Agrupar contactos, sucursales, contratos, facturación y compras originadas.

Atributos:

- `id`
- `legalName`
- `tradeName`
- `taxId`
- `accountType`
- `industry`
- `lifecycleStatus`
- `riskTier`

Métodos sugeridos:

- `qualify()`
- `disqualify(reason)`
- `activateAsCustomer()`
- `suspend(reason)`

### `SalesOpportunity`

Responsabilidades:

- Modelar una negociación comercial.
- Calcular ingreso esperado.
- Controlar etapas del pipeline.

Métodos:

- `moveTo(stage)`
- `estimateRevenue()`
- `closeWon()`
- `closeLost(reason)`

### `CommercialProposal`

Responsabilidades:

- Agrupar líneas de cotización.
- Validar si necesita aprobación.
- Generar propuesta final al comercio.

Métodos:

- `addLine()`
- `requiresApproval()`
- `markSent()`
- `accept()`
- `reject()`

### `B2BContract`

Responsabilidades:

- Representar contrato marco.
- Mantener versiones contractuales.

Métodos:

- `createVersion()`
- `terminate()`
- `getActiveVersion(atDate)`

### `ContractVersion`

Responsabilidades:

- Congelar condiciones comerciales vigentes por periodo.
- Evitar sobrescritura histórica.

Métodos:

- `isValidAt(date)`
- `approve()`
- `supersede()`

### `CommercialTerm`

Responsabilidades:

- Representar MDR, suscripción, setup fee, fee de servicio, penalidades.

Métodos:

- `calculateCharge(baseAmount)`

### `MerchantBranch`

Responsabilidades:

- Representar una sucursal operativa.
- Controlar habilitación de originación BNPL.

Métodos:

- `activate()`
- `disableOrigination(reason)`

### `MerchantInvoice`

Responsabilidades:

- Emitir factura B2B al comercio.
- Agrupar líneas y saldos.

Métodos:

- `issue()`
- `markPaid()`
- `cancel()`
- `calculateTotals()`

### `MerchantReceivable`

Responsabilidades:

- Representar CxC comercial de ATLAS contra comercio.
- No representa deuda de cuotas del consumidor.

Métodos:

- `applyPayment(amount)`
- `markOverdue()`
- `close()`

### `MerchantPayable`

Responsabilidades:

- Representar obligación de ATLAS con comercio cuando cubre cuota impaga.

Métodos:

- `schedule()`
- `markPaid()`
- `dispute()`

### `ConsumerRecoveryReceivable`

Responsabilidades:

- Representar recuperación contra consumidor después de cobertura.

Métodos:

- `openFromCoverage(merchantPayable)`
- `applyRecoveryPayment(amount)`
- `writeOff()`

---

## Relaciones relevantes

- `B2BAccount` compone `B2BContact`, `MerchantBranch`, `SalesOpportunity`, `B2BContract`.
- `SalesOpportunity` genera `CommercialProposal`.
- `CommercialProposal` puede generar `B2BContract`.
- `B2BContract` contiene `ContractVersion`.
- `ContractVersion` contiene `CommercialTerm` y `MDRRule`.
- `BNPLPurchase` referencia `B2BAccount`, `MerchantBranch` y `ContractVersion`.
- `BNPLPurchase` genera cargos MDR a través de `MerchantReceivable` o `MerchantInvoiceLine`.
- `BNPLInstallment` puede generar `MerchantPayable` si el consumidor no paga.
- `MerchantPayable` pagado puede generar `ConsumerRecoveryReceivable`.

---

## Separación de responsabilidades

| Clase                        | No debe hacer                                     |
| ---------------------------- | ------------------------------------------------- |
| `B2BAccount`                 | No calcula score del consumidor.                  |
| `SalesOpportunity`           | No emite facturas ni crea compras BNPL.           |
| `CommercialProposal`         | No activa comercios directamente.                 |
| `B2BContract`                | No sobrescribe condiciones históricas.            |
| `MerchantReceivable`         | No representa cuotas normales del consumidor.     |
| `MerchantPayable`            | No representa MDR.                                |
| `ConsumerRecoveryReceivable` | No nace antes de una cobertura ATLAS al comercio. |
