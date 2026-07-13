# Modelo relacional - ATLAS Contabilidad General

## Decisiones de diseño

El modelo se organiza por dominios. La tabla de mayor volumen es `journal_entry_line`, seguida por `billing_event`, `bank_statement_line`, `document_audit_log` y `event_outbox`. Para producción se recomienda particionar por `legal_entity_id` y mes contable (`posting_date` o `created_at`).

Reglas base:

1. `accounting_document` es la cabecera contable del documento.
2. `journal_entry` y `journal_entry_line` son el mayor universal.
3. AR, AP, banco, activos, deuda, provisiones e impuestos son submayores.
4. `business_partner` es el maestro único de clientes, comercios, proveedores, bancos, lenders, socios e intercompany.
5. `posting_rule_version` y `tax_rule_version` son inmutables por versión.
6. Un asiento publicado no se edita; se revierte con `reversal_of_id`.

## Núcleo organizacional

| Tabla               | Responsabilidad                                | Relación principal       |
| ------------------- | ---------------------------------------------- | ------------------------ |
| `legal_entity`      | Sociedad legal que reporta estados financieros | raíz del modelo          |
| `branch`            | Sucursal o punto operativo                     | N:1 con entidad legal    |
| `fiscal_year`       | Ejercicio fiscal por entidad                   | N:1 con entidad legal    |
| `accounting_period` | Mes o periodo de cierre                        | N:1 con ejercicio fiscal |
| `ledger`            | Libro local, gestión o IFRS                    | N:1 con entidad legal    |
| `chart_of_accounts` | Plan de cuentas versionado                     | 1:N con cuentas GL       |
| `gl_account`        | Cuenta contable del mayor                      | N:1 con plan de cuentas  |
| `cost_center`       | Centro de costo                                | N:1 con entidad legal    |
| `profit_center`     | Centro de beneficio / segmento                 | N:1 con entidad legal    |

## Terceros y contratos

| Tabla                   | Responsabilidad                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `business_partner`      | Maestro único de contraparte                                                                    |
| `business_partner_role` | Rol financiero/comercial: customer, merchant, supplier, bank, lender, shareholder, intercompany |
| `bp_address`            | Direcciones fiscales u operativas                                                               |
| `bp_bank_account`       | Cuentas bancarias de terceros                                                                   |
| `contract_header`       | Contrato comercial, deuda, proveedor, intercompany o SaaS                                       |
| `contract_term`         | Condiciones versionadas del contrato                                                            |

## Contabilidad y submayores

| Dominio     | Tablas                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| Mayor       | `accounting_document`, `journal_entry`, `journal_entry_line`, `document_attachment`, `document_audit_log` |
| Facturación | `billing_rule`, `billing_event`, `ar_invoice`, `ar_invoice_line`, `electronic_tax_document`               |
| AR          | `receipt`, `receipt_allocation`                                                                           |
| AP          | `ap_invoice`, `ap_invoice_line`, `supplier_payment`                                                       |
| Tesorería   | `bank_account`, `bank_statement`, `bank_statement_line`, `payment_order`                                  |
| Deuda       | `loan_contract`, `loan_schedule`, `loan_accrual`                                                          |
| Activos     | `fixed_asset`, `asset_depreciation_run`                                                                   |
| Provisiones | `provision_case`, `provision_movement`                                                                    |
| Fiscal      | `tax_code`, `tax_rule_version`                                                                            |
| Cierre      | `close_run`, `financial_statement_snapshot`                                                               |
| Integración | `posting_rule_version`, `event_outbox`, `reconciliation_run`, `reconciliation_item`                       |

## Checks técnicos obligatorios

- `journal_entry_line.debit >= 0` y `journal_entry_line.credit >= 0`.
- No permitir línea con debit y credit simultáneamente salvo cero técnico bloqueado por constraint.
- Validar en aplicación o trigger que suma débitos = suma créditos por `journal_entry_id` antes de publicar.
- No publicar en periodo cerrado.
- No borrar documentos publicados.
- `event_outbox.event_key` único para idempotencia.
- `electronic_tax_document.cuf` único cuando exista.
