# Flujos contables, políticas e integraciones

## Flujo maestro de contabilización

1. Un evento operativo llega desde portal, API, batch o motor interno.
2. Se valida idempotencia con `event_outbox.event_key` o fuente externa.
3. El motor selecciona `posting_rule_version` vigente.
4. Se genera `accounting_document` en estado `DRAFT`.
5. Se genera `journal_entry` y sus `journal_entry_line`.
6. Se valida partida doble.
7. Se valida periodo abierto.
8. Se publica el asiento.
9. Se actualiza submayor o referencia operacional.
10. Se emite evento financiero para reporting, auditoría o integración.

## Flujos críticos

### Venta financiada BNPL con MDR

- Entrada: compra financiada desde comercio.
- Se registra `billing_event` por MDR.
- Se calcula factura al comercio o settlement neto según contrato.
- Se genera AR o compensación contra liquidación.
- Se reconoce ingreso MDR según regla contractual.
- Se publica asiento: Dr CxC comercio / Cr Ingreso MDR / Cr IVA débito fiscal.

### Cuota vencida con cobertura de ATLAS al comercio

- Entrada: cuota vencida no pagada por consumidor.
- Motor de cobranza detecta incumplimiento.
- Se ejecuta pago de ATLAS al comercio si el contrato lo exige.
- Se crea CxC al consumidor o exposición recuperable.
- Se usa provisión si ya existía; si no, se registra gasto.
- Se activa cobranza y seguimiento de recuperación.

### Factura SaaS corporativa

- Entrada: ciclo mensual de contrato SaaS.
- Se genera `billing_event` mensual.
- Se emite factura comercial y fiscal.
- Si el servicio ya se prestó, se reconoce ingreso.
- Si existe pago anticipado o implementación no separable, se difiere ingreso.

### Préstamo bancario

- Entrada: desembolso recibido en banco.
- Se registra `loan_contract` y `loan_schedule`.
- Se contabiliza Dr Banco / Cr Préstamo.
- Mensualmente se devenga interés.
- Al pagar cuota se separa capital, interés y fee.

### Cierre mensual

- Cerrar AR.
- Cerrar AP.
- Conciliar bancos.
- Cerrar activos y depreciación.
- Cerrar deuda e intereses.
- Liquidar impuestos mensuales.
- Validar GL y submayores.
- Congelar snapshots.
- Bloquear periodo.

## Matriz de eventos e impactos

| Evento                         | Fuente          | Tablas afectadas                                               | Asiento esperado                            |
| ------------------------------ | --------------- | -------------------------------------------------------------- | ------------------------------------------- |
| `billing.event.recorded`       | Comercial       | `billing_event`                                                | no siempre contabiliza                      |
| `invoice.issued`               | Billing/Fiscal  | `ar_invoice`, `electronic_tax_document`, `accounting_document` | Dr CxC / Cr ingreso / Cr impuesto           |
| `receipt.received`             | Banco/Tesorería | `receipt`, `receipt_allocation`, `bank_statement_line`         | Dr Banco / Cr CxC                           |
| `supplier.invoice.approved`    | Compras/AP      | `ap_invoice`, `ap_invoice_line`                                | Dr gasto/activo/impuesto / Cr CxP           |
| `payment.order.executed`       | Tesorería       | `payment_order`, `supplier_payment`                            | Dr CxP / Cr Banco                           |
| `loan.disbursed`               | Finanzas        | `loan_contract`, `accounting_document`                         | Dr Banco / Cr deuda                         |
| `loan.accrual.generated`       | Batch cierre    | `loan_accrual`                                                 | Dr gasto interés / Cr interés por pagar     |
| `asset.placed_in_service`      | Activos         | `fixed_asset`                                                  | no necesariamente contabiliza               |
| `asset.depreciation.generated` | Batch cierre    | `asset_depreciation_run`                                       | Dr depreciación / Cr depreciación acumulada |
| `provision.updated`            | Riesgo/Legal    | `provision_case`, `provision_movement`                         | Dr gasto provisión / Cr provisión           |
| `period.close.requested`       | Contabilidad    | `close_run`, `financial_statement_snapshot`                    | no asiento salvo ajustes                    |

## Controles mínimos de auditoría

- Bitácora para cambios de cuenta, contrato, regla e impuesto.
- Hash para documentos fiscales y soportes.
- Reverso documentado para correcciones.
- Doble aprobación en banco, write-off y reapertura de periodo.
- Conciliación AR-GL, AP-GL, Banco-GL, Activos-GL y Provisiones-GL.
