# Modelo de clases - ATLAS Contabilidad General

## Enfoque

El modelo de clases no debe crear una clase gigante `AccountingService`. La separación correcta es:

- **Entidades de dominio:** `AccountingDocument`, `JournalEntry`, `ArInvoice`, `LoanContract`, `FixedAsset`, `ProvisionCase`.
- **Objetos de valor:** `Money`, `PeriodRef`, `SourceRef`, `AuditStamp`.
- **Servicios de dominio:** `PostingEngine`, `DoubleEntryValidator`, `PeriodGuard`, `ReconciliationMatcher`.
- **Servicios de aplicación:** casos de uso transaccionales que orquestan repositorios y motores.
- **Repositorios:** acceso a persistencia sin lógica contable pesada.
- **Políticas versionadas:** reglas fiscales, reglas de posting, reglas de reconocimiento de ingresos, reglas de provisión.

## Reglas de diseño de clases

1. `JournalEntry` conoce sus líneas y puede validar si está balanceado, pero no consulta base de datos.
2. `PostingEngine` transforma eventos de negocio en documentos contables usando reglas versionadas.
3. `AccountingDocument` representa el documento publicable y reversible.
4. `ArInvoice`, `ApInvoice`, `LoanContract`, `FixedAsset` y `ProvisionCase` viven como agregados independientes.
5. La conciliación no modifica el asiento; crea `ReconciliationItem` y marca estado de matching.
6. Los servicios de aplicación no deben contener SQL ni reglas fiscales duras.
7. Las reglas contables se versionan y se cargan desde `posting_rule_version`.

## Agregados principales

| Agregado       | Raíz                 | Entidades internas                       | Invariantes                                                  |
| -------------- | -------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| Mayor contable | `AccountingDocument` | `JournalEntry`, `JournalEntryLine`       | débitos = créditos, periodo abierto, no edición si publicado |
| Facturación AR | `ArInvoice`          | `ArInvoiceLine`, `ElectronicTaxDocument` | factura única por entidad, monto bruto = neto + impuesto     |
| Cobranza       | `Receipt`            | asignaciones a factura                   | no asignar más que saldo pendiente                           |
| AP             | `ApInvoice`          | `ApInvoiceLine`, `SupplierPayment`       | pago requiere aprobación y factura válida                    |
| Tesorería      | `BankStatement`      | `BankStatementLine`                      | línea conciliada no se rematchea sin reverso                 |
| Deuda          | `LoanContract`       | `LoanSchedule`, `LoanAccrual`            | saldo vivo no puede ser negativo                             |
| Activos        | `FixedAsset`         | `DepreciationRun`                        | depreciación inicia al poner en servicio                     |
| Provisiones    | `ProvisionCase`      | `ProvisionMovement`                      | roll-forward explica saldo final                             |
| Cierre         | `CloseRun`           | `FinancialStatementSnapshot`             | no cerrar si hay descuadres o submayores abiertos            |
