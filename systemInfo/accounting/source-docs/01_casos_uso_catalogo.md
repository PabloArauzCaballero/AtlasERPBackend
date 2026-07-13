# Catálogo completo de casos de uso - ATLAS Contabilidad General

Este catálogo acompaña el diagrama `plantuml/01_use_cases_master.puml`. Cada caso de uso está pensado para un módulo contable tipo SAP-like, pero implementable de forma liviana y modular.

## Reglas globales de diseño

- Todo asiento publicado es inmutable: se corrige con reverso, no editando el journal.
- Todo documento contable debe pertenecer a una entidad legal, ledger, periodo y fecha de contabilización.
- Todo proceso sensible exige bitácora, evidencia y segregación de funciones.
- Todo evento externo debe ser idempotente mediante `event_key`.
- Todo cierre genera snapshot auditable del estado financiero y reglas vigentes.

## Índice por módulo

- **Configuración financiera maestra**: 16 casos de uso
- **Maestro único de terceros / Business Partner**: 15 casos de uso
- **Contratos, tarifas y condiciones comerciales**: 14 casos de uso
- **Facturación comercial y fiscal**: 17 casos de uso
- **Cuentas por cobrar / AR**: 13 casos de uso
- **Cuentas por pagar / AP**: 12 casos de uso
- **Tesorería, bancos y liquidez**: 16 casos de uso
- **Deuda empresarial y pasivos financieros**: 15 casos de uso
- **Activos, intangibles y diferidos**: 15 casos de uso
- **Patrimonio, capital y socios**: 15 casos de uso
- **Provisiones, garantías y contingencias**: 10 casos de uso
- **Libro diario, mayor y motor contable**: 14 casos de uso
- **Contabilidad analítica y control presupuestario**: 13 casos de uso
- **Impuestos, fiscalidad y cumplimiento local**: 14 casos de uso
- **Cierre contable, estados financieros y reporting**: 19 casos de uso
- **Integración contable con operación BNPL ATLAS**: 14 casos de uso
- **Auditoría, control interno y seguridad**: 13 casos de uso
- **APIs, eventos, outbox y escalabilidad**: 13 casos de uso

## Configuración financiera maestra

| ID                      | Caso de uso                                      | Actores principales                              | Propósito                                                                                                                                     | Entidades principales                                                |
| ----------------------- | ------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `UC_ConfigEntidad`      | Configurar entidad legal                         | Administrador del Sistema, Contador General      | Permitir configurar entidad legal con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                         | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_ConfigSucursales`   | Configurar sucursales                            | Administrador del Sistema                        | Permitir configurar sucursales con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                            | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_ConfigCalendario`   | Configurar calendario fiscal                     | Administrador del Sistema, Contador General      | Permitir configurar calendario fiscal con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                     | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |
| `UC_Periodos`           | Abrir y cerrar periodos contables                | Contador General, CFO                            | Permitir abrir y cerrar periodos contables con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_ConfigLedgers`      | Configurar ledgers contables Local/Gestión/IFRS  | Administrador del Sistema, Contador General, CFO | Permitir configurar ledgers contables local/gestión/ifrs con trazabilidad contable, control de permisos, evidencia y conciliación posterior.  | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_PlanCuentas`        | Configurar plan de cuentas                       | Contador General, CFO                            | Permitir configurar plan de cuentas con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                       | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_CuentasGL`          | Crear cuentas contables GL                       | Contador General                                 | Permitir crear cuentas contables gl con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                       | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_CuentasControl`     | Configurar cuentas de control                    | Contador General                                 | Permitir configurar cuentas de control con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                    | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_CentrosCosto`       | Configurar centros de costo                      | Contador General, Gerente Financiero             | Permitir configurar centros de costo con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                      | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_CentrosBeneficio`   | Configurar centros de beneficio                  | Contador General, Gerente Financiero             | Permitir configurar centros de beneficio con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                  | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_Monedas`            | Configurar monedas y tipos de cambio             | Administrador del Sistema, Contador General      | Permitir configurar monedas y tipos de cambio con trazabilidad contable, control de permisos, evidencia y conciliación posterior.             | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_Impuestos`          | Configurar impuestos                             | Contador General, Legal / Compliance             | Permitir configurar impuestos con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                             | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_VersionReglas`      | Versionar reglas contables                       | Contador General, Auditor Interno                | Permitir versionar reglas contables con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                       | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_ReglasPosting`      | Configurar reglas automáticas de contabilización | Contador General, Administrador del Sistema      | Permitir configurar reglas automáticas de contabilización con trazabilidad contable, control de permisos, evidencia y conciliación posterior. | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_PerfilesAprobacion` | Configurar perfiles de aprobación                | Administrador del Sistema, CFO                   | Permitir configurar perfiles de aprobación con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_Permisos`           | Configurar matriz de permisos contables          | Administrador del Sistema, Auditor Interno       | Permitir configurar matriz de permisos contables con trazabilidad contable, control de permisos, evidencia y conciliación posterior.          | `accounting_document, journal_entry, journal_entry_line`             |

### UC_ConfigEntidad - Configurar entidad legal

**Actores:** Administrador del Sistema, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ConfigSucursales - Configurar sucursales

**Actores:** Administrador del Sistema

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ConfigCalendario - Configurar calendario fiscal

**Actores:** Administrador del Sistema, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_Periodos - Abrir y cerrar periodos contables

**Actores:** Contador General, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ConfigLedgers - Configurar ledgers contables Local/Gestión/IFRS

**Actores:** Administrador del Sistema, Contador General, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_PlanCuentas - Configurar plan de cuentas

**Actores:** Contador General, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CuentasGL - Crear cuentas contables GL

**Actores:** Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CuentasControl - Configurar cuentas de control

**Actores:** Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CentrosCosto - Configurar centros de costo

**Actores:** Contador General, Gerente Financiero

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CentrosBeneficio - Configurar centros de beneficio

**Actores:** Contador General, Gerente Financiero

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_Monedas - Configurar monedas y tipos de cambio

**Actores:** Administrador del Sistema, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_Impuestos - Configurar impuestos

**Actores:** Contador General, Legal / Compliance

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_VersionReglas - Versionar reglas contables

**Actores:** Contador General, Auditor Interno

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ReglasPosting - Configurar reglas automáticas de contabilización

**Actores:** Contador General, Administrador del Sistema

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_PerfilesAprobacion - Configurar perfiles de aprobación

**Actores:** Administrador del Sistema, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_Permisos - Configurar matriz de permisos contables

**Actores:** Administrador del Sistema, Auditor Interno

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

## Maestro único de terceros / Business Partner

| ID                      | Caso de uso                                | Actores principales                                                       | Propósito                                                                                                                               | Entidades principales                                                                                                          |
| ----------------------- | ------------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `UC_CrearBP`            | Crear Business Partner                     | Auxiliar Contable, Operaciones ATLAS, Equipo de Compras, Equipo de Ventas | Permitir crear business partner con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                     | `accounting_document, ar_invoice, business_partner, business_partner_role, contract_header, electronic_tax_document, tax_code` |
| `UC_RolBP`              | Clasificar rol del tercero                 | Auxiliar Contable, Legal / Compliance                                     | Permitir clasificar rol del tercero con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                 | `business_partner, business_partner_role, contract_header`                                                                     |
| `UC_BPClienteCorp`      | Registrar cliente corporativo              | Equipo de Ventas, Cliente Corporativo                                     | Permitir registrar cliente corporativo con trazabilidad contable, control de permisos, evidencia y conciliación posterior.              | `business_partner, business_partner_role, contract_header`                                                                     |
| `UC_BPComercio`         | Registrar comercio afiliado                | Operaciones ATLAS, Comercio Afiliado                                      | Permitir registrar comercio afiliado con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                | `business_partner, business_partner_role, contract_header`                                                                     |
| `UC_BPConsumidor`       | Registrar consumidor asociado              | Operaciones ATLAS, Consumidor Final                                       | Permitir registrar consumidor asociado con trazabilidad contable, control de permisos, evidencia y conciliación posterior.              | `accounting_document, journal_entry, journal_entry_line`                                                                       |
| `UC_BPProveedor`        | Registrar proveedor                        | Equipo de Compras, Proveedor                                              | Permitir registrar proveedor con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                        | `business_partner, business_partner_role, contract_header`                                                                     |
| `UC_BPBanco`            | Registrar banco                            | Tesorero, Banco                                                           | Permitir registrar banco con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                            | `bank_account, bank_statement, payment_order, receipt`                                                                         |
| `UC_BPLender`           | Registrar lender / acreedor                | CFO, Lender / Acreedor Financiero                                         | Permitir registrar lender / acreedor con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                | `loan_accrual, loan_contract, loan_schedule`                                                                                   |
| `UC_BPSocio`            | Registrar socio / accionista               | CFO, Socio / Accionista                                                   | Permitir registrar socio / accionista con trazabilidad contable, control de permisos, evidencia y conciliación posterior.               | `business_partner, business_partner_role, contract_header`                                                                     |
| `UC_BPIntercompany`     | Registrar intercompany                     | Contador General, CFO                                                     | Permitir registrar intercompany con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                     | `accounting_document, journal_entry, journal_entry_line`                                                                       |
| `UC_DatosFiscalesBP`    | Gestionar datos fiscales del tercero       | Auxiliar Contable, Legal / Compliance                                     | Permitir gestionar datos fiscales del tercero con trazabilidad contable, control de permisos, evidencia y conciliación posterior.       | `accounting_document, ar_invoice, business_partner, business_partner_role, contract_header, electronic_tax_document, tax_code` |
| `UC_CuentasBancariasBP` | Gestionar cuentas bancarias del tercero    | Auxiliar Contable, Tesorero                                               | Permitir gestionar cuentas bancarias del tercero con trazabilidad contable, control de permisos, evidencia y conciliación posterior.    | `business_partner, business_partner_role, contract_header`                                                                     |
| `UC_ValidarKYC`         | Validar KYB / KYC del tercero              | Legal / Compliance, Equipo de Riesgo, API Buró / Riesgo                   | Permitir validar kyb / kyc del tercero con trazabilidad contable, control de permisos, evidencia y conciliación posterior.              | `business_partner, business_partner_role, contract_header`                                                                     |
| `UC_BloquearBP`         | Bloquear o suspender tercero               | Legal / Compliance, CFO, Equipo de Riesgo                                 | Permitir bloquear o suspender tercero con trazabilidad contable, control de permisos, evidencia y conciliación posterior.               | `business_partner, business_partner_role, contract_header`                                                                     |
| `UC_HistorialBP`        | Consultar historial financiero del tercero | Atención al Cliente, Contador General, Equipo de Riesgo                   | Permitir consultar historial financiero del tercero con trazabilidad contable, control de permisos, evidencia y conciliación posterior. | `business_partner, business_partner_role, contract_header`                                                                     |

### UC_CrearBP - Crear Business Partner

**Actores:** Auxiliar Contable, Operaciones ATLAS, Equipo de Compras, Equipo de Ventas

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_RolBP - Clasificar rol del tercero

**Actores:** Auxiliar Contable, Legal / Compliance

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_BPClienteCorp - Registrar cliente corporativo

**Actores:** Equipo de Ventas, Cliente Corporativo

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_BPComercio - Registrar comercio afiliado

**Actores:** Operaciones ATLAS, Comercio Afiliado

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_BPConsumidor - Registrar consumidor asociado

**Actores:** Operaciones ATLAS, Consumidor Final

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_BPProveedor - Registrar proveedor

**Actores:** Equipo de Compras, Proveedor

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_BPBanco - Registrar banco

**Actores:** Tesorero, Banco

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_BPLender - Registrar lender / acreedor

**Actores:** CFO, Lender / Acreedor Financiero

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_BPSocio - Registrar socio / accionista

**Actores:** CFO, Socio / Accionista

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_BPIntercompany - Registrar intercompany

**Actores:** Contador General, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_DatosFiscalesBP - Gestionar datos fiscales del tercero

**Actores:** Auxiliar Contable, Legal / Compliance

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CuentasBancariasBP - Gestionar cuentas bancarias del tercero

**Actores:** Auxiliar Contable, Tesorero

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ValidarKYC - Validar KYB / KYC del tercero

**Actores:** Legal / Compliance, Equipo de Riesgo, API Buró / Riesgo

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_BloquearBP - Bloquear o suspender tercero

**Actores:** Legal / Compliance, CFO, Equipo de Riesgo

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_HistorialBP - Consultar historial financiero del tercero

**Actores:** Atención al Cliente, Contador General, Equipo de Riesgo

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

## Contratos, tarifas y condiciones comerciales

| ID                        | Caso de uso                                | Actores principales                                       | Propósito                                                                                                                               | Entidades principales                                                                                                          |
| ------------------------- | ------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `UC_ContratoComercio`     | Crear contrato con comercio                | Equipo de Ventas, Legal / Compliance, Comercio Afiliado   | Permitir crear contrato con comercio con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                | `business_partner, business_partner_role, contract_header`                                                                     |
| `UC_ContratoCorp`         | Crear contrato con cliente corporativo     | Equipo de Ventas, Legal / Compliance, Cliente Corporativo | Permitir crear contrato con cliente corporativo con trazabilidad contable, control de permisos, evidencia y conciliación posterior.     | `business_partner, business_partner_role, contract_header`                                                                     |
| `UC_ContratoIntercompany` | Crear contrato intercompany                | CFO, Legal / Compliance, Contador General                 | Permitir crear contrato intercompany con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                | `accounting_document, journal_entry, journal_entry_line`                                                                       |
| `UC_ContratoProveedor`    | Crear contrato con proveedor               | Equipo de Compras, Legal / Compliance, Proveedor          | Permitir crear contrato con proveedor con trazabilidad contable, control de permisos, evidencia y conciliación posterior.               | `business_partner, business_partner_role, contract_header`                                                                     |
| `UC_ContratoDeuda`        | Crear contrato de deuda / préstamo         | CFO, Legal / Compliance, Lender / Acreedor Financiero     | Permitir crear contrato de deuda / préstamo con trazabilidad contable, control de permisos, evidencia y conciliación posterior.         | `loan_accrual, loan_contract, loan_schedule`                                                                                   |
| `UC_DefinirMDR`           | Definir MDR por comercio                   | Equipo de Ventas, CFO                                     | Permitir definir mdr por comercio con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                   | `accounting_document, ar_invoice, business_partner, business_partner_role, contract_header, electronic_tax_document, tax_code` |
| `UC_TarifaSaaS`           | Definir tarifa SaaS corporativa            | Equipo de Ventas, CFO                                     | Permitir definir tarifa saas corporativa con trazabilidad contable, control de permisos, evidencia y conciliación posterior.            | `accounting_document, ar_invoice, electronic_tax_document, tax_code`                                                           |
| `UC_FeeImplementacion`    | Definir fee de implementación              | Equipo de Ventas, CFO                                     | Permitir definir fee de implementación con trazabilidad contable, control de permisos, evidencia y conciliación posterior.              | `accounting_document, journal_entry, journal_entry_line`                                                                       |
| `UC_Penalidades`          | Definir penalidades y cargos               | Legal / Compliance, Equipo de Ventas, CFO                 | Permitir definir penalidades y cargos con trazabilidad contable, control de permisos, evidencia y conciliación posterior.               | `accounting_document, journal_entry, journal_entry_line`                                                                       |
| `UC_CondicionesPago`      | Definir condiciones de pago                | Equipo de Ventas, Equipo de Compras, CFO                  | Permitir definir condiciones de pago con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                | `bank_account, bank_statement, payment_order, receipt`                                                                         |
| `UC_CoberturaComercio`    | Definir garantías o coberturas a comercios | Legal / Compliance, Equipo de Riesgo, CFO                 | Permitir definir garantías o coberturas a comercios con trazabilidad contable, control de permisos, evidencia y conciliación posterior. | `business_partner, business_partner_role, contract_header`                                                                     |
| `UC_VersionContrato`      | Versionar términos contractuales           | Legal / Compliance, Auditor Interno                       | Permitir versionar términos contractuales con trazabilidad contable, control de permisos, evidencia y conciliación posterior.           | `accounting_document, journal_entry, journal_entry_line`                                                                       |
| `UC_AprobarContratoFin`   | Aprobar contrato financiero                | CFO, Directorio                                           | Permitir aprobar contrato financiero con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                | `accounting_document, journal_entry, journal_entry_line`                                                                       |
| `UC_SoporteContrato`      | Adjuntar soporte contractual               | Legal / Compliance, Equipo de Compras, Equipo de Ventas   | Permitir adjuntar soporte contractual con trazabilidad contable, control de permisos, evidencia y conciliación posterior.               | `accounting_document, journal_entry, journal_entry_line`                                                                       |

### UC_ContratoComercio - Crear contrato con comercio

**Actores:** Equipo de Ventas, Legal / Compliance, Comercio Afiliado

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ContratoCorp - Crear contrato con cliente corporativo

**Actores:** Equipo de Ventas, Legal / Compliance, Cliente Corporativo

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ContratoIntercompany - Crear contrato intercompany

**Actores:** CFO, Legal / Compliance, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ContratoProveedor - Crear contrato con proveedor

**Actores:** Equipo de Compras, Legal / Compliance, Proveedor

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ContratoDeuda - Crear contrato de deuda / préstamo

**Actores:** CFO, Legal / Compliance, Lender / Acreedor Financiero

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_DefinirMDR - Definir MDR por comercio

**Actores:** Equipo de Ventas, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_TarifaSaaS - Definir tarifa SaaS corporativa

**Actores:** Equipo de Ventas, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_FeeImplementacion - Definir fee de implementación

**Actores:** Equipo de Ventas, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_Penalidades - Definir penalidades y cargos

**Actores:** Legal / Compliance, Equipo de Ventas, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CondicionesPago - Definir condiciones de pago

**Actores:** Equipo de Ventas, Equipo de Compras, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CoberturaComercio - Definir garantías o coberturas a comercios

**Actores:** Legal / Compliance, Equipo de Riesgo, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_VersionContrato - Versionar términos contractuales

**Actores:** Legal / Compliance, Auditor Interno

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_AprobarContratoFin - Aprobar contrato financiero

**Actores:** CFO, Directorio

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_SoporteContrato - Adjuntar soporte contractual

**Actores:** Legal / Compliance, Equipo de Compras, Equipo de Ventas

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

## Facturación comercial y fiscal

| ID                         | Caso de uso                           | Actores principales                                                           | Propósito                                                                                                                          | Entidades principales                                                                                                          |
| -------------------------- | ------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `UC_EventoFacturable`      | Generar evento facturable             | Equipo de Ventas, Motor de Facturación, Outbox / Event Bus                    | Permitir generar evento facturable con trazabilidad contable, control de permisos, evidencia y conciliación posterior.             | `accounting_document, ar_invoice, electronic_tax_document, tax_code`                                                           |
| `UC_FacturaMDR`            | Calcular factura por MDR              | Motor de Facturación, Comercio Afiliado                                       | Permitir calcular factura por mdr con trazabilidad contable, control de permisos, evidencia y conciliación posterior.              | `accounting_document, ar_invoice, electronic_tax_document, tax_code`                                                           |
| `UC_FacturaSaaS`           | Calcular factura SaaS corporativa     | Motor de Facturación, Cliente Corporativo                                     | Permitir calcular factura saas corporativa con trazabilidad contable, control de permisos, evidencia y conciliación posterior.     | `accounting_document, ar_invoice, electronic_tax_document, tax_code`                                                           |
| `UC_FacturaImplementacion` | Calcular factura por implementación   | Motor de Facturación, Cliente Corporativo                                     | Permitir calcular factura por implementación con trazabilidad contable, control de permisos, evidencia y conciliación posterior.   | `accounting_document, ar_invoice, electronic_tax_document, tax_code`                                                           |
| `UC_FacturaIntercompany`   | Calcular factura intercompany         | Motor de Facturación, Contador General                                        | Permitir calcular factura intercompany con trazabilidad contable, control de permisos, evidencia y conciliación posterior.         | `accounting_document, ar_invoice, electronic_tax_document, tax_code`                                                           |
| `UC_GenerarFactura`        | Generar factura comercial             | Motor de Facturación, Contador General                                        | Permitir generar factura comercial con trazabilidad contable, control de permisos, evidencia y conciliación posterior.             | `accounting_document, ar_invoice, electronic_tax_document, tax_code`                                                           |
| `UC_EmitirFacturaSIN`      | Emitir factura electrónica SIN        | Motor de Facturación, API Facturación Electrónica, SIN Bolivia / SIAT         | Permitir emitir factura electrónica sin con trazabilidad contable, control de permisos, evidencia y conciliación posterior.        | `accounting_document, ar_invoice, electronic_tax_document, tax_code`                                                           |
| `UC_CUFCUFD`               | Generar CUF / CUFD                    | API Facturación Electrónica, SIN Bolivia / SIAT                               | Permitir generar cuf / cufd con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                    | `accounting_document, journal_entry, journal_entry_line`                                                                       |
| `UC_EnviarXML`             | Enviar XML fiscal                     | API Facturación Electrónica, SIN Bolivia / SIAT                               | Permitir enviar xml fiscal con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                     | `accounting_document, ar_invoice, electronic_tax_document, tax_code`                                                           |
| `UC_EstadoFacturaFiscal`   | Consultar estado de factura fiscal    | API Facturación Electrónica, SIN Bolivia / SIAT, Contador General             | Permitir consultar estado de factura fiscal con trazabilidad contable, control de permisos, evidencia y conciliación posterior.    | `accounting_document, ar_invoice, electronic_tax_document, tax_code`                                                           |
| `UC_ContingenciaFiscal`    | Gestionar contingencia de facturación | Contador General, Legal / Compliance, API Facturación Electrónica             | Permitir gestionar contingencia de facturación con trazabilidad contable, control de permisos, evidencia y conciliación posterior. | `accounting_document, ar_invoice, electronic_tax_document, tax_code`                                                           |
| `UC_NotaCredito`           | Emitir nota de crédito                | Contador General, Motor de Facturación                                        | Permitir emitir nota de crédito con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                | `accounting_document, ar_invoice, electronic_tax_document, tax_code`                                                           |
| `UC_NotaDebito`            | Emitir nota de débito                 | Contador General, Motor de Facturación                                        | Permitir emitir nota de débito con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                 | `accounting_document, ar_invoice, electronic_tax_document, tax_code`                                                           |
| `UC_AnularFactura`         | Anular factura                        | Contador General, Legal / Compliance, API Facturación Electrónica             | Permitir anular factura con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                        | `accounting_document, ar_invoice, electronic_tax_document, tax_code`                                                           |
| `UC_ReprocesarFactura`     | Reprocesar factura rechazada          | Contador General, Motor de Facturación                                        | Permitir reprocesar factura rechazada con trazabilidad contable, control de permisos, evidencia y conciliación posterior.          | `accounting_document, ar_invoice, electronic_tax_document, tax_code`                                                           |
| `UC_EnviarFacturaCliente`  | Enviar factura al cliente             | Motor de Notificaciones, Cliente Corporativo, Comercio Afiliado               | Permitir enviar factura al cliente con trazabilidad contable, control de permisos, evidencia y conciliación posterior.             | `accounting_document, ar_invoice, business_partner, business_partner_role, contract_header, electronic_tax_document, tax_code` |
| `UC_DisputaFactura`        | Registrar disputa de factura          | Atención al Cliente, Equipo de Ventas, Cliente Corporativo, Comercio Afiliado | Permitir registrar disputa de factura con trazabilidad contable, control de permisos, evidencia y conciliación posterior.          | `accounting_document, ar_invoice, electronic_tax_document, tax_code`                                                           |

### UC_EventoFacturable - Generar evento facturable

**Actores:** Equipo de Ventas, Motor de Facturación, Outbox / Event Bus

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_FacturaMDR - Calcular factura por MDR

**Actores:** Motor de Facturación, Comercio Afiliado

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_FacturaSaaS - Calcular factura SaaS corporativa

**Actores:** Motor de Facturación, Cliente Corporativo

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_FacturaImplementacion - Calcular factura por implementación

**Actores:** Motor de Facturación, Cliente Corporativo

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_FacturaIntercompany - Calcular factura intercompany

**Actores:** Motor de Facturación, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_GenerarFactura - Generar factura comercial

**Actores:** Motor de Facturación, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_EmitirFacturaSIN - Emitir factura electrónica SIN

**Actores:** Motor de Facturación, API Facturación Electrónica, SIN Bolivia / SIAT

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CUFCUFD - Generar CUF / CUFD

**Actores:** API Facturación Electrónica, SIN Bolivia / SIAT

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_EnviarXML - Enviar XML fiscal

**Actores:** API Facturación Electrónica, SIN Bolivia / SIAT

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_EstadoFacturaFiscal - Consultar estado de factura fiscal

**Actores:** API Facturación Electrónica, SIN Bolivia / SIAT, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ContingenciaFiscal - Gestionar contingencia de facturación

**Actores:** Contador General, Legal / Compliance, API Facturación Electrónica

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_NotaCredito - Emitir nota de crédito

**Actores:** Contador General, Motor de Facturación

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_NotaDebito - Emitir nota de débito

**Actores:** Contador General, Motor de Facturación

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_AnularFactura - Anular factura

**Actores:** Contador General, Legal / Compliance, API Facturación Electrónica

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ReprocesarFactura - Reprocesar factura rechazada

**Actores:** Contador General, Motor de Facturación

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_EnviarFacturaCliente - Enviar factura al cliente

**Actores:** Motor de Notificaciones, Cliente Corporativo, Comercio Afiliado

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_DisputaFactura - Registrar disputa de factura

**Actores:** Atención al Cliente, Equipo de Ventas, Cliente Corporativo, Comercio Afiliado

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

## Cuentas por cobrar / AR

| ID                         | Caso de uso                            | Actores principales                                                           | Propósito                                                                                                                           | Entidades principales                                                |
| -------------------------- | -------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `UC_CrearCxC`              | Crear cuenta por cobrar                | Contador General, Auxiliar Contable, Motor Automático de Posting              | Permitir crear cuenta por cobrar con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_SubmayorAR`            | Registrar submayor AR                  | Motor Automático de Posting, Contador General                                 | Permitir registrar submayor ar con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                  | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_EstadoCuentaCliente`   | Consultar estado de cuenta de cliente  | Atención al Cliente, Cliente Corporativo, Comercio Afiliado, Contador General | Permitir consultar estado de cuenta de cliente con trazabilidad contable, control de permisos, evidencia y conciliación posterior.  | `business_partner, business_partner_role, contract_header`           |
| `UC_AgingAR`               | Consultar antigüedad de saldos AR      | Equipo de Cobranza, Contador General, Gerente Financiero                      | Permitir consultar antigüedad de saldos ar con trazabilidad contable, control de permisos, evidencia y conciliación posterior.      | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_AplicarCobro`          | Aplicar cobranza a factura             | Tesorero, Motor de Conciliación                                               | Permitir aplicar cobranza a factura con trazabilidad contable, control de permisos, evidencia y conciliación posterior.             | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |
| `UC_PagoParcialAR`         | Aplicar pago parcial                   | Tesorero, Equipo de Cobranza                                                  | Permitir aplicar pago parcial con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                   | `bank_account, bank_statement, payment_order, receipt`               |
| `UC_CompensarNC`           | Compensar factura con nota de crédito  | Contador General                                                              | Permitir compensar factura con nota de crédito con trazabilidad contable, control de permisos, evidencia y conciliación posterior.  | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |
| `UC_ReclasificarAR`        | Reclasificar AR corriente / vencida    | Contador General, Equipo de Cobranza                                          | Permitir reclasificar ar corriente / vencida con trazabilidad contable, control de permisos, evidencia y conciliación posterior.    | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_WriteOffAR`            | Registrar incobrable / write-off       | Equipo de Cobranza, Contador General                                          | Permitir registrar incobrable / write-off con trazabilidad contable, control de permisos, evidencia y conciliación posterior.       | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |
| `UC_AprobarWriteOff`       | Aprobar write-off                      | CFO, Auditor Interno                                                          | Permitir aprobar write-off con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                      | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |
| `UC_ECLAR`                 | Registrar provisión ECL / deterioro AR | Equipo de Riesgo, Contador General                                            | Permitir registrar provisión ecl / deterioro ar con trazabilidad contable, control de permisos, evidencia y conciliación posterior. | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_ConciliarARGL`         | Conciliar AR con mayor contable        | Contador General, Motor de Conciliación                                       | Permitir conciliar ar con mayor contable con trazabilidad contable, control de permisos, evidencia y conciliación posterior.        | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_ExportarEstadoCliente` | Exportar estado de cuenta para cliente | Atención al Cliente, Cliente Corporativo, Comercio Afiliado                   | Permitir exportar estado de cuenta para cliente con trazabilidad contable, control de permisos, evidencia y conciliación posterior. | `business_partner, business_partner_role, contract_header`           |

### UC_CrearCxC - Crear cuenta por cobrar

**Actores:** Contador General, Auxiliar Contable, Motor Automático de Posting

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_SubmayorAR - Registrar submayor AR

**Actores:** Motor Automático de Posting, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_EstadoCuentaCliente - Consultar estado de cuenta de cliente

**Actores:** Atención al Cliente, Cliente Corporativo, Comercio Afiliado, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_AgingAR - Consultar antigüedad de saldos AR

**Actores:** Equipo de Cobranza, Contador General, Gerente Financiero

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_AplicarCobro - Aplicar cobranza a factura

**Actores:** Tesorero, Motor de Conciliación

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_PagoParcialAR - Aplicar pago parcial

**Actores:** Tesorero, Equipo de Cobranza

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CompensarNC - Compensar factura con nota de crédito

**Actores:** Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ReclasificarAR - Reclasificar AR corriente / vencida

**Actores:** Contador General, Equipo de Cobranza

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_WriteOffAR - Registrar incobrable / write-off

**Actores:** Equipo de Cobranza, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_AprobarWriteOff - Aprobar write-off

**Actores:** CFO, Auditor Interno

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ECLAR - Registrar provisión ECL / deterioro AR

**Actores:** Equipo de Riesgo, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ConciliarARGL - Conciliar AR con mayor contable

**Actores:** Contador General, Motor de Conciliación

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ExportarEstadoCliente - Exportar estado de cuenta para cliente

**Actores:** Atención al Cliente, Cliente Corporativo, Comercio Afiliado

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

## Cuentas por pagar / AP

| ID                           | Caso de uso                       | Actores principales                             | Propósito                                                                                                                      | Entidades principales                                                                                                          |
| ---------------------------- | --------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `UC_FacturaProveedor`        | Registrar factura de proveedor    | Equipo de Compras, Auxiliar Contable, Proveedor | Permitir registrar factura de proveedor con trazabilidad contable, control de permisos, evidencia y conciliación posterior.    | `accounting_document, ar_invoice, business_partner, business_partner_role, contract_header, electronic_tax_document, tax_code` |
| `UC_ValidarFacturaProveedor` | Validar factura de proveedor      | Equipo de Compras, Auxiliar Contable            | Permitir validar factura de proveedor con trazabilidad contable, control de permisos, evidencia y conciliación posterior.      | `accounting_document, ar_invoice, business_partner, business_partner_role, contract_header, electronic_tax_document, tax_code` |
| `UC_AsignarCentroCosto`      | Asignar centro de costo a gasto   | Equipo de Compras, Auxiliar Contable            | Permitir asignar centro de costo a gasto con trazabilidad contable, control de permisos, evidencia y conciliación posterior.   | `accounting_document, journal_entry, journal_entry_line`                                                                       |
| `UC_CrearCxP`                | Crear cuenta por pagar            | Auxiliar Contable, Motor Automático de Posting  | Permitir crear cuenta por pagar con trazabilidad contable, control de permisos, evidencia y conciliación posterior.            | `accounting_document, journal_entry, journal_entry_line`                                                                       |
| `UC_SubmayorAP`              | Registrar submayor AP             | Motor Automático de Posting, Contador General   | Permitir registrar submayor ap con trazabilidad contable, control de permisos, evidencia y conciliación posterior.             | `accounting_document, journal_entry, journal_entry_line`                                                                       |
| `UC_AgingAP`                 | Consultar antigüedad de saldos AP | Contador General, Tesorero                      | Permitir consultar antigüedad de saldos ap con trazabilidad contable, control de permisos, evidencia y conciliación posterior. | `accounting_document, journal_entry, journal_entry_line`                                                                       |
| `UC_ProgramarPagoProveedor`  | Programar pago a proveedor        | Equipo de Compras, Tesorero                     | Permitir programar pago a proveedor con trazabilidad contable, control de permisos, evidencia y conciliación posterior.        | `bank_account, bank_statement, business_partner, business_partner_role, contract_header, payment_order, receipt`               |
| `UC_AprobarPagoProveedor`    | Aprobar pago a proveedor          | Gerente Financiero, CFO                         | Permitir aprobar pago a proveedor con trazabilidad contable, control de permisos, evidencia y conciliación posterior.          | `bank_account, bank_statement, business_partner, business_partner_role, contract_header, payment_order, receipt`               |
| `UC_EjecutarPagoProveedor`   | Ejecutar pago a proveedor         | Tesorero                                        | Permitir ejecutar pago a proveedor con trazabilidad contable, control de permisos, evidencia y conciliación posterior.         | `bank_account, bank_statement, business_partner, business_partner_role, contract_header, payment_order, receipt`               |
| `UC_Retenciones`             | Registrar retenciones fiscales    | Contador General, Legal / Compliance            | Permitir registrar retenciones fiscales con trazabilidad contable, control de permisos, evidencia y conciliación posterior.    | `accounting_document, ar_invoice, electronic_tax_document, tax_code`                                                           |
| `UC_NCProveedor`             | Aplicar nota de crédito proveedor | Auxiliar Contable, Contador General             | Permitir aplicar nota de crédito proveedor con trazabilidad contable, control de permisos, evidencia y conciliación posterior. | `accounting_document, ar_invoice, business_partner, business_partner_role, contract_header, electronic_tax_document, tax_code` |
| `UC_ConciliarAPGL`           | Conciliar AP con mayor contable   | Contador General, Motor de Conciliación         | Permitir conciliar ap con mayor contable con trazabilidad contable, control de permisos, evidencia y conciliación posterior.   | `accounting_document, journal_entry, journal_entry_line`                                                                       |

### UC_FacturaProveedor - Registrar factura de proveedor

**Actores:** Equipo de Compras, Auxiliar Contable, Proveedor

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ValidarFacturaProveedor - Validar factura de proveedor

**Actores:** Equipo de Compras, Auxiliar Contable

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_AsignarCentroCosto - Asignar centro de costo a gasto

**Actores:** Equipo de Compras, Auxiliar Contable

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CrearCxP - Crear cuenta por pagar

**Actores:** Auxiliar Contable, Motor Automático de Posting

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_SubmayorAP - Registrar submayor AP

**Actores:** Motor Automático de Posting, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_AgingAP - Consultar antigüedad de saldos AP

**Actores:** Contador General, Tesorero

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ProgramarPagoProveedor - Programar pago a proveedor

**Actores:** Equipo de Compras, Tesorero

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_AprobarPagoProveedor - Aprobar pago a proveedor

**Actores:** Gerente Financiero, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_EjecutarPagoProveedor - Ejecutar pago a proveedor

**Actores:** Tesorero

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_Retenciones - Registrar retenciones fiscales

**Actores:** Contador General, Legal / Compliance

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_NCProveedor - Aplicar nota de crédito proveedor

**Actores:** Auxiliar Contable, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ConciliarAPGL - Conciliar AP con mayor contable

**Actores:** Contador General, Motor de Conciliación

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

## Tesorería, bancos y liquidez

| ID                           | Caso de uso                         | Actores principales                               | Propósito                                                                                                                        | Entidades principales                                    |
| ---------------------------- | ----------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `UC_CuentaBancariaInterna`   | Crear cuenta bancaria interna       | Tesorero, Banco                                   | Permitir crear cuenta bancaria interna con trazabilidad contable, control de permisos, evidencia y conciliación posterior.       | `accounting_document, journal_entry, journal_entry_line` |
| `UC_AprobarCuentaBanco`      | Aprobar alta de cuenta bancaria     | CFO, Tesorero                                     | Permitir aprobar alta de cuenta bancaria con trazabilidad contable, control de permisos, evidencia y conciliación posterior.     | `accounting_document, journal_entry, journal_entry_line` |
| `UC_ImportarExtracto`        | Importar extracto bancario          | Tesorero, API Bancaria                            | Permitir importar extracto bancario con trazabilidad contable, control de permisos, evidencia y conciliación posterior.          | `bank_account, bank_statement, payment_order, receipt`   |
| `UC_MovimientoBancario`      | Registrar movimiento bancario       | Tesorero, API Bancaria                            | Permitir registrar movimiento bancario con trazabilidad contable, control de permisos, evidencia y conciliación posterior.       | `accounting_document, journal_entry, journal_entry_line` |
| `UC_ConciliarBancoAR`        | Conciliar banco contra AR           | Tesorero, Motor de Conciliación                   | Permitir conciliar banco contra ar con trazabilidad contable, control de permisos, evidencia y conciliación posterior.           | `bank_account, bank_statement, payment_order, receipt`   |
| `UC_ConciliarBancoAP`        | Conciliar banco contra AP           | Tesorero, Motor de Conciliación                   | Permitir conciliar banco contra ap con trazabilidad contable, control de permisos, evidencia y conciliación posterior.           | `bank_account, bank_statement, payment_order, receipt`   |
| `UC_ConciliarBancoGL`        | Conciliar banco contra GL           | Tesorero, Motor de Conciliación, Contador General | Permitir conciliar banco contra gl con trazabilidad contable, control de permisos, evidencia y conciliación posterior.           | `bank_account, bank_statement, payment_order, receipt`   |
| `UC_PartidasNoIdentificadas` | Gestionar partidas no identificadas | Tesorero, Contador General                        | Permitir gestionar partidas no identificadas con trazabilidad contable, control de permisos, evidencia y conciliación posterior. | `accounting_document, journal_entry, journal_entry_line` |
| `UC_TransferenciaInterna`    | Registrar transferencia interna     | Tesorero                                          | Permitir registrar transferencia interna con trazabilidad contable, control de permisos, evidencia y conciliación posterior.     | `accounting_document, journal_entry, journal_entry_line` |
| `UC_ComisionesBanco`         | Registrar comisiones bancarias      | Tesorero, Contador General                        | Permitir registrar comisiones bancarias con trazabilidad contable, control de permisos, evidencia y conciliación posterior.      | `accounting_document, journal_entry, journal_entry_line` |
| `UC_FlujoCaja`               | Gestionar flujo de caja             | Gerente Financiero, CFO                           | Permitir gestionar flujo de caja con trazabilidad contable, control de permisos, evidencia y conciliación posterior.             | `accounting_document, journal_entry, journal_entry_line` |
| `UC_ProyeccionLiquidez`      | Proyectar liquidez                  | Gerente Financiero, CFO                           | Permitir proyectar liquidez con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                  | `bank_account, bank_statement, payment_order, receipt`   |
| `UC_CashForecast`            | Gestionar cash forecast             | Gerente Financiero, Tesorero                      | Permitir gestionar cash forecast con trazabilidad contable, control de permisos, evidencia y conciliación posterior.             | `accounting_document, journal_entry, journal_entry_line` |
| `UC_SaldosMinimos`           | Controlar saldos mínimos            | Tesorero, Gerente Financiero                      | Permitir controlar saldos mínimos con trazabilidad contable, control de permisos, evidencia y conciliación posterior.            | `accounting_document, journal_entry, journal_entry_line` |
| `UC_PaymentRun`              | Ejecutar payment run                | Tesorero, API Bancaria                            | Permitir ejecutar payment run con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                | `accounting_document, journal_entry, journal_entry_line` |
| `UC_BloquearPago`            | Bloquear pago sospechoso            | Tesorero, Legal / Compliance, CFO                 | Permitir bloquear pago sospechoso con trazabilidad contable, control de permisos, evidencia y conciliación posterior.            | `bank_account, bank_statement, payment_order, receipt`   |

### UC_CuentaBancariaInterna - Crear cuenta bancaria interna

**Actores:** Tesorero, Banco

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_AprobarCuentaBanco - Aprobar alta de cuenta bancaria

**Actores:** CFO, Tesorero

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ImportarExtracto - Importar extracto bancario

**Actores:** Tesorero, API Bancaria

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_MovimientoBancario - Registrar movimiento bancario

**Actores:** Tesorero, API Bancaria

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ConciliarBancoAR - Conciliar banco contra AR

**Actores:** Tesorero, Motor de Conciliación

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ConciliarBancoAP - Conciliar banco contra AP

**Actores:** Tesorero, Motor de Conciliación

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ConciliarBancoGL - Conciliar banco contra GL

**Actores:** Tesorero, Motor de Conciliación, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_PartidasNoIdentificadas - Gestionar partidas no identificadas

**Actores:** Tesorero, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_TransferenciaInterna - Registrar transferencia interna

**Actores:** Tesorero

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ComisionesBanco - Registrar comisiones bancarias

**Actores:** Tesorero, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_FlujoCaja - Gestionar flujo de caja

**Actores:** Gerente Financiero, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ProyeccionLiquidez - Proyectar liquidez

**Actores:** Gerente Financiero, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CashForecast - Gestionar cash forecast

**Actores:** Gerente Financiero, Tesorero

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_SaldosMinimos - Controlar saldos mínimos

**Actores:** Tesorero, Gerente Financiero

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_PaymentRun - Ejecutar payment run

**Actores:** Tesorero, API Bancaria

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_BloquearPago - Bloquear pago sospechoso

**Actores:** Tesorero, Legal / Compliance, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

## Deuda empresarial y pasivos financieros

| ID                         | Caso de uso                          | Actores principales                                                | Propósito                                                                                                                         | Entidades principales                                                                                            |
| -------------------------- | ------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `UC_PrestamoBanco`         | Registrar préstamo bancario          | CFO, Banco                                                         | Permitir registrar préstamo bancario con trazabilidad contable, control de permisos, evidencia y conciliación posterior.          | `loan_accrual, loan_contract, loan_schedule`                                                                     |
| `UC_LineaCredito`          | Registrar línea de crédito revolving | CFO, Banco                                                         | Permitir registrar línea de crédito revolving con trazabilidad contable, control de permisos, evidencia y conciliación posterior. | `accounting_document, ar_invoice, electronic_tax_document, tax_code`                                             |
| `UC_DeudaInversionista`    | Registrar deuda con inversionista    | CFO, Inversionista, Lender / Acreedor Financiero                   | Permitir registrar deuda con inversionista con trazabilidad contable, control de permisos, evidencia y conciliación posterior.    | `loan_accrual, loan_contract, loan_schedule`                                                                     |
| `UC_BonoPagare`            | Registrar bono / pagaré              | CFO, Legal / Compliance                                            | Permitir registrar bono / pagaré con trazabilidad contable, control de permisos, evidencia y conciliación posterior.              | `accounting_document, journal_entry, journal_entry_line`                                                         |
| `UC_DeudaIntercompany`     | Registrar deuda intercompany         | CFO, Contador General                                              | Permitir registrar deuda intercompany con trazabilidad contable, control de permisos, evidencia y conciliación posterior.         | `loan_accrual, loan_contract, loan_schedule`                                                                     |
| `UC_CronogramaDeuda`       | Crear cronograma de deuda            | CFO, Contador General                                              | Permitir crear cronograma de deuda con trazabilidad contable, control de permisos, evidencia y conciliación posterior.            | `loan_accrual, loan_contract, loan_schedule`                                                                     |
| `UC_DevengarInteres`       | Devengar intereses                   | Motor Automático de Posting, Scheduler de Cierre, Contador General | Permitir devengar intereses con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                   | `accounting_document, journal_entry, journal_entry_line`                                                         |
| `UC_InteresPorPagar`       | Registrar intereses por pagar        | Motor Automático de Posting, Contador General                      | Permitir registrar intereses por pagar con trazabilidad contable, control de permisos, evidencia y conciliación posterior.        | `accounting_document, journal_entry, journal_entry_line`                                                         |
| `UC_PagarCuotaDeuda`       | Pagar cuota de deuda                 | Tesorero, Lender / Acreedor Financiero                             | Permitir pagar cuota de deuda con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                 | `loan_accrual, loan_contract, loan_schedule`                                                                     |
| `UC_SepararCapitalInteres` | Separar capital, interés y fee       | Tesorero, Contador General                                         | Permitir separar capital, interés y fee con trazabilidad contable, control de permisos, evidencia y conciliación posterior.       | `accounting_document, ar_invoice, electronic_tax_document, loan_accrual, loan_contract, loan_schedule, tax_code` |
| `UC_ReclasificarDeuda`     | Reclasificar deuda CP / LP           | Contador General, CFO                                              | Permitir reclasificar deuda cp / lp con trazabilidad contable, control de permisos, evidencia y conciliación posterior.           | `loan_accrual, loan_contract, loan_schedule`                                                                     |
| `UC_Refinanciamiento`      | Registrar refinanciamiento           | CFO, Legal / Compliance, Lender / Acreedor Financiero              | Permitir registrar refinanciamiento con trazabilidad contable, control de permisos, evidencia y conciliación posterior.           | `accounting_document, journal_entry, journal_entry_line`                                                         |
| `UC_Covenant`              | Registrar covenant financiero        | CFO, Lender / Acreedor Financiero                                  | Permitir registrar covenant financiero con trazabilidad contable, control de permisos, evidencia y conciliación posterior.        | `loan_accrual, loan_contract, loan_schedule`                                                                     |
| `UC_MonitorearCovenant`    | Monitorear cumplimiento de covenant  | CFO, Lender / Acreedor Financiero, Inversionista                   | Permitir monitorear cumplimiento de covenant con trazabilidad contable, control de permisos, evidencia y conciliación posterior.  | `accounting_document, ar_invoice, electronic_tax_document, loan_accrual, loan_contract, loan_schedule, tax_code` |
| `UC_ReporteDeuda`          | Reportar deuda a CFO / Directorio    | CFO, Directorio, Inversionista                                     | Permitir reportar deuda a cfo / directorio con trazabilidad contable, control de permisos, evidencia y conciliación posterior.    | `loan_accrual, loan_contract, loan_schedule`                                                                     |

### UC_PrestamoBanco - Registrar préstamo bancario

**Actores:** CFO, Banco

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_LineaCredito - Registrar línea de crédito revolving

**Actores:** CFO, Banco

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_DeudaInversionista - Registrar deuda con inversionista

**Actores:** CFO, Inversionista, Lender / Acreedor Financiero

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_BonoPagare - Registrar bono / pagaré

**Actores:** CFO, Legal / Compliance

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_DeudaIntercompany - Registrar deuda intercompany

**Actores:** CFO, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CronogramaDeuda - Crear cronograma de deuda

**Actores:** CFO, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_DevengarInteres - Devengar intereses

**Actores:** Motor Automático de Posting, Scheduler de Cierre, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_InteresPorPagar - Registrar intereses por pagar

**Actores:** Motor Automático de Posting, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_PagarCuotaDeuda - Pagar cuota de deuda

**Actores:** Tesorero, Lender / Acreedor Financiero

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_SepararCapitalInteres - Separar capital, interés y fee

**Actores:** Tesorero, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ReclasificarDeuda - Reclasificar deuda CP / LP

**Actores:** Contador General, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_Refinanciamiento - Registrar refinanciamiento

**Actores:** CFO, Legal / Compliance, Lender / Acreedor Financiero

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_Covenant - Registrar covenant financiero

**Actores:** CFO, Lender / Acreedor Financiero

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_MonitorearCovenant - Monitorear cumplimiento de covenant

**Actores:** CFO, Lender / Acreedor Financiero, Inversionista

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ReporteDeuda - Reportar deuda a CFO / Directorio

**Actores:** CFO, Directorio, Inversionista

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

## Activos, intangibles y diferidos

| ID                        | Caso de uso                            | Actores principales                     | Propósito                                                                                                                           | Entidades principales                                                                                     |
| ------------------------- | -------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `UC_ActivoFijo`           | Registrar activo fijo                  | Auxiliar Contable, Contador General     | Permitir registrar activo fijo con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                  | `asset_depreciation_run, fixed_asset`                                                                     |
| `UC_EquipoTecnologico`    | Registrar equipo tecnológico           | Auxiliar Contable, Contador General     | Permitir registrar equipo tecnológico con trazabilidad contable, control de permisos, evidencia y conciliación posterior.           | `accounting_document, journal_entry, journal_entry_line`                                                  |
| `UC_SoftwareCapitalizado` | Registrar software propio capitalizado | Contador General, CFO                   | Permitir registrar software propio capitalizado con trazabilidad contable, control de permisos, evidencia y conciliación posterior. | `accounting_document, ar_invoice, asset_depreciation_run, electronic_tax_document, fixed_asset, tax_code` |
| `UC_LicenciaCapitalizada` | Registrar licencia capitalizada        | Contador General, Equipo de Compras     | Permitir registrar licencia capitalizada con trazabilidad contable, control de permisos, evidencia y conciliación posterior.        | `accounting_document, ar_invoice, asset_depreciation_run, electronic_tax_document, fixed_asset, tax_code` |
| `UC_Intangible`           | Registrar activo intangible            | Contador General, CFO                   | Permitir registrar activo intangible con trazabilidad contable, control de permisos, evidencia y conciliación posterior.            | `asset_depreciation_run, fixed_asset`                                                                     |
| `UC_ActivoDiferido`       | Registrar activo diferido              | Contador General                        | Permitir registrar activo diferido con trazabilidad contable, control de permisos, evidencia y conciliación posterior.              | `asset_depreciation_run, fixed_asset`                                                                     |
| `UC_GarantiaEntregada`    | Registrar garantía entregada           | Tesorero, Legal / Compliance            | Permitir registrar garantía entregada con trazabilidad contable, control de permisos, evidencia y conciliación posterior.           | `accounting_document, journal_entry, journal_entry_line`                                                  |
| `UC_DepositoEntregado`    | Registrar depósito entregado           | Tesorero, Contador General              | Permitir registrar depósito entregado con trazabilidad contable, control de permisos, evidencia y conciliación posterior.           | `accounting_document, ar_invoice, electronic_tax_document, tax_code`                                      |
| `UC_ActivoEnServicio`     | Poner activo en servicio               | Contador General                        | Permitir poner activo en servicio con trazabilidad contable, control de permisos, evidencia y conciliación posterior.               | `asset_depreciation_run, fixed_asset`                                                                     |
| `UC_Depreciacion`         | Calcular depreciación                  | Scheduler de Cierre, Contador General   | Permitir calcular depreciación con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                  | `asset_depreciation_run, fixed_asset`                                                                     |
| `UC_Amortizacion`         | Calcular amortización                  | Scheduler de Cierre, Contador General   | Permitir calcular amortización con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                  | `asset_depreciation_run, fixed_asset`                                                                     |
| `UC_BajaActivo`           | Registrar baja de activo               | Contador General, CFO                   | Permitir registrar baja de activo con trazabilidad contable, control de permisos, evidencia y conciliación posterior.               | `asset_depreciation_run, fixed_asset`                                                                     |
| `UC_DeterioroActivo`      | Registrar deterioro de activo          | Contador General, CFO                   | Permitir registrar deterioro de activo con trazabilidad contable, control de permisos, evidencia y conciliación posterior.          | `asset_depreciation_run, fixed_asset`                                                                     |
| `UC_ConciliarActivosGL`   | Conciliar submayor de activos con GL   | Contador General, Motor de Conciliación | Permitir conciliar submayor de activos con gl con trazabilidad contable, control de permisos, evidencia y conciliación posterior.   | `asset_depreciation_run, fixed_asset`                                                                     |
| `UC_InventarioActivos`    | Generar inventario de activos          | Contador General, Auditor Interno       | Permitir generar inventario de activos con trazabilidad contable, control de permisos, evidencia y conciliación posterior.          | `asset_depreciation_run, fixed_asset`                                                                     |

### UC_ActivoFijo - Registrar activo fijo

**Actores:** Auxiliar Contable, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_EquipoTecnologico - Registrar equipo tecnológico

**Actores:** Auxiliar Contable, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_SoftwareCapitalizado - Registrar software propio capitalizado

**Actores:** Contador General, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_LicenciaCapitalizada - Registrar licencia capitalizada

**Actores:** Contador General, Equipo de Compras

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_Intangible - Registrar activo intangible

**Actores:** Contador General, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ActivoDiferido - Registrar activo diferido

**Actores:** Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_GarantiaEntregada - Registrar garantía entregada

**Actores:** Tesorero, Legal / Compliance

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_DepositoEntregado - Registrar depósito entregado

**Actores:** Tesorero, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ActivoEnServicio - Poner activo en servicio

**Actores:** Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_Depreciacion - Calcular depreciación

**Actores:** Scheduler de Cierre, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_Amortizacion - Calcular amortización

**Actores:** Scheduler de Cierre, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_BajaActivo - Registrar baja de activo

**Actores:** Contador General, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_DeterioroActivo - Registrar deterioro de activo

**Actores:** Contador General, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ConciliarActivosGL - Conciliar submayor de activos con GL

**Actores:** Contador General, Motor de Conciliación

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_InventarioActivos - Generar inventario de activos

**Actores:** Contador General, Auditor Interno

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

## Patrimonio, capital y socios

| ID                        | Caso de uso                                     | Actores principales                       | Propósito                                                                                                                                    | Entidades principales                                                |
| ------------------------- | ----------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `UC_CapitalSocial`        | Registrar capital social                        | CFO, Contador General, Socio / Accionista | Permitir registrar capital social con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                        | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |
| `UC_AporteSocio`          | Registrar aporte de socio                       | CFO, Socio / Accionista                   | Permitir registrar aporte de socio con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                       | `business_partner, business_partner_role, contract_header`           |
| `UC_AporteCapitalizar`    | Registrar aporte por capitalizar                | CFO, Contador General                     | Permitir registrar aporte por capitalizar con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |
| `UC_CapitalizarAporte`    | Capitalizar aporte                              | CFO, Contador General, Socio / Accionista | Permitir capitalizar aporte con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                              | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |
| `UC_PrimaEmision`         | Registrar prima de emisión                      | CFO, Contador General                     | Permitir registrar prima de emisión con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                      | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_ReservaLegal`         | Registrar reserva legal                         | Contador General, CFO                     | Permitir registrar reserva legal con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                         | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_OtrasReservas`        | Registrar otras reservas                        | Contador General, CFO                     | Permitir registrar otras reservas con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                        | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_UtilidadRetenida`     | Registrar utilidad retenida                     | Contador General, CFO                     | Permitir registrar utilidad retenida con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                     | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_ResultadoEjercicio`   | Registrar resultado del ejercicio               | Contador General, CFO                     | Permitir registrar resultado del ejercicio con trazabilidad contable, control de permisos, evidencia y conciliación posterior.               | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_AprobarDividendos`    | Aprobar distribución de dividendos              | Directorio, CFO                           | Permitir aprobar distribución de dividendos con trazabilidad contable, control de permisos, evidencia y conciliación posterior.              | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_DividendosPagar`      | Registrar dividendos por pagar                  | Contador General, CFO                     | Permitir registrar dividendos por pagar con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                  | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_PagarDividendos`      | Pagar dividendos                                | Tesorero, Socio / Accionista              | Permitir pagar dividendos con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                                | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_EstadoPatrimonio`     | Generar estado de evolución patrimonial         | Contador General, CFO, Socio / Accionista | Permitir generar estado de evolución patrimonial con trazabilidad contable, control de permisos, evidencia y conciliación posterior.         | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_ConsolidarPatrimonio` | Consolidar patrimonio del grupo                 | CFO, Contador General                     | Permitir consolidar patrimonio del grupo con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                 | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_MovPatrimonialExtra`  | Registrar movimiento patrimonial extraordinario | CFO, Contador General                     | Permitir registrar movimiento patrimonial extraordinario con trazabilidad contable, control de permisos, evidencia y conciliación posterior. | `accounting_document, journal_entry, journal_entry_line`             |

### UC_CapitalSocial - Registrar capital social

**Actores:** CFO, Contador General, Socio / Accionista

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_AporteSocio - Registrar aporte de socio

**Actores:** CFO, Socio / Accionista

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_AporteCapitalizar - Registrar aporte por capitalizar

**Actores:** CFO, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CapitalizarAporte - Capitalizar aporte

**Actores:** CFO, Contador General, Socio / Accionista

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_PrimaEmision - Registrar prima de emisión

**Actores:** CFO, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ReservaLegal - Registrar reserva legal

**Actores:** Contador General, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_OtrasReservas - Registrar otras reservas

**Actores:** Contador General, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_UtilidadRetenida - Registrar utilidad retenida

**Actores:** Contador General, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ResultadoEjercicio - Registrar resultado del ejercicio

**Actores:** Contador General, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_AprobarDividendos - Aprobar distribución de dividendos

**Actores:** Directorio, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_DividendosPagar - Registrar dividendos por pagar

**Actores:** Contador General, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_PagarDividendos - Pagar dividendos

**Actores:** Tesorero, Socio / Accionista

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_EstadoPatrimonio - Generar estado de evolución patrimonial

**Actores:** Contador General, CFO, Socio / Accionista

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ConsolidarPatrimonio - Consolidar patrimonio del grupo

**Actores:** CFO, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_MovPatrimonialExtra - Registrar movimiento patrimonial extraordinario

**Actores:** CFO, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

## Provisiones, garantías y contingencias

| ID                              | Caso de uso                                  | Actores principales                                    | Propósito                                                                                                                                 | Entidades principales                                      |
| ------------------------------- | -------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `UC_CrearProvision`             | Crear caso de provisión                      | Contador General, Legal / Compliance, Equipo de Riesgo | Permitir crear caso de provisión con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                      | `accounting_document, journal_entry, journal_entry_line`   |
| `UC_ProvisionCoberturaComercio` | Registrar provisión por cobertura a comercio | Equipo de Riesgo, Contador General                     | Permitir registrar provisión por cobertura a comercio con trazabilidad contable, control de permisos, evidencia y conciliación posterior. | `business_partner, business_partner_role, contract_header` |
| `UC_ProvisionLegal`             | Registrar provisión legal                    | Legal / Compliance, Contador General                   | Permitir registrar provisión legal con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                    | `accounting_document, journal_entry, journal_entry_line`   |
| `UC_PasivoContingente`          | Registrar pasivo contingente                 | Legal / Compliance, Contador General                   | Permitir registrar pasivo contingente con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                 | `accounting_document, journal_entry, journal_entry_line`   |
| `UC_ActualizarProvision`        | Actualizar estimación de provisión           | Equipo de Riesgo, Legal / Compliance, Contador General | Permitir actualizar estimación de provisión con trazabilidad contable, control de permisos, evidencia y conciliación posterior.           | `accounting_document, journal_entry, journal_entry_line`   |
| `UC_LiberarProvision`           | Liberar provisión                            | Contador General, CFO                                  | Permitir liberar provisión con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                            | `accounting_document, journal_entry, journal_entry_line`   |
| `UC_EjecutarCobertura`          | Ejecutar cobertura al comercio               | Operaciones ATLAS, Tesorero, Comercio Afiliado         | Permitir ejecutar cobertura al comercio con trazabilidad contable, control de permisos, evidencia y conciliación posterior.               | `business_partner, business_partner_role, contract_header` |
| `UC_RecuperacionPosterior`      | Registrar recuperación posterior             | Equipo de Cobranza, Tesorero                           | Permitir registrar recuperación posterior con trazabilidad contable, control de permisos, evidencia y conciliación posterior.             | `accounting_document, journal_entry, journal_entry_line`   |
| `UC_RollForwardProvision`       | Generar roll-forward de provisiones          | Contador General, Auditor Interno                      | Permitir generar roll-forward de provisiones con trazabilidad contable, control de permisos, evidencia y conciliación posterior.          | `accounting_document, journal_entry, journal_entry_line`   |
| `UC_ConciliarProvisionGL`       | Conciliar provisiones con GL                 | Contador General, Motor de Conciliación                | Permitir conciliar provisiones con gl con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                 | `accounting_document, journal_entry, journal_entry_line`   |

### UC_CrearProvision - Crear caso de provisión

**Actores:** Contador General, Legal / Compliance, Equipo de Riesgo

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ProvisionCoberturaComercio - Registrar provisión por cobertura a comercio

**Actores:** Equipo de Riesgo, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ProvisionLegal - Registrar provisión legal

**Actores:** Legal / Compliance, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_PasivoContingente - Registrar pasivo contingente

**Actores:** Legal / Compliance, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ActualizarProvision - Actualizar estimación de provisión

**Actores:** Equipo de Riesgo, Legal / Compliance, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_LiberarProvision - Liberar provisión

**Actores:** Contador General, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_EjecutarCobertura - Ejecutar cobertura al comercio

**Actores:** Operaciones ATLAS, Tesorero, Comercio Afiliado

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_RecuperacionPosterior - Registrar recuperación posterior

**Actores:** Equipo de Cobranza, Tesorero

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_RollForwardProvision - Generar roll-forward de provisiones

**Actores:** Contador General, Auditor Interno

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ConciliarProvisionGL - Conciliar provisiones con GL

**Actores:** Contador General, Motor de Conciliación

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

## Libro diario, mayor y motor contable

| ID                         | Caso de uso                           | Actores principales                                    | Propósito                                                                                                                          | Entidades principales                                                |
| -------------------------- | ------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `UC_DocContable`           | Generar documento contable            | Motor Automático de Posting, Contador General          | Permitir generar documento contable con trazabilidad contable, control de permisos, evidencia y conciliación posterior.            | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_AsientoAutomatico`     | Generar asiento automático            | Motor Automático de Posting                            | Permitir generar asiento automático con trazabilidad contable, control de permisos, evidencia y conciliación posterior.            | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_AsientoManual`         | Registrar asiento manual              | Contador General                                       | Permitir registrar asiento manual con trazabilidad contable, control de permisos, evidencia y conciliación posterior.              | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_ValidarPartidaDoble`   | Validar partida doble                 | Motor Automático de Posting, Contador General          | Permitir validar partida doble con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                 | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_PublicarAsiento`       | Publicar asiento                      | Contador General, Motor Automático de Posting          | Permitir publicar asiento con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                      | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_ReversarAsiento`       | Reversar asiento                      | Contador General, Motor Automático de Posting          | Permitir reversar asiento con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                      | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_ReprocesarAsiento`     | Reprocesar asiento fallido            | Motor Automático de Posting, Administrador del Sistema | Permitir reprocesar asiento fallido con trazabilidad contable, control de permisos, evidencia y conciliación posterior.            | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_BloquearEdicion`       | Bloquear edición de asiento publicado | Motor Automático de Posting, Auditor Interno           | Permitir bloquear edición de asiento publicado con trazabilidad contable, control de permisos, evidencia y conciliación posterior. | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_LibroDiario`           | Consultar libro diario                | Contador General, Auditor Externo                      | Permitir consultar libro diario con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_LibroMayor`            | Consultar libro mayor                 | Contador General, Auditor Externo                      | Permitir consultar libro mayor con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                 | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_BalanceComprobacion`   | Consultar balance de comprobación     | Contador General, Auditor Externo                      | Permitir consultar balance de comprobación con trazabilidad contable, control de permisos, evidencia y conciliación posterior.     | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_ConciliarSubmayoresGL` | Conciliar submayores con GL           | Contador General, Motor de Conciliación                | Permitir conciliar submayores con gl con trazabilidad contable, control de permisos, evidencia y conciliación posterior.           | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_DetectarDescuadre`     | Detectar asientos descuadrados        | Motor Automático de Posting, Auditor Interno           | Permitir detectar asientos descuadrados con trazabilidad contable, control de permisos, evidencia y conciliación posterior.        | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_TrazabilidadAsiento`   | Auditar trazabilidad origen-asiento   | Auditor Interno, Contador General                      | Permitir auditar trazabilidad origen-asiento con trazabilidad contable, control de permisos, evidencia y conciliación posterior.   | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |

### UC_DocContable - Generar documento contable

**Actores:** Motor Automático de Posting, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_AsientoAutomatico - Generar asiento automático

**Actores:** Motor Automático de Posting

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_AsientoManual - Registrar asiento manual

**Actores:** Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ValidarPartidaDoble - Validar partida doble

**Actores:** Motor Automático de Posting, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_PublicarAsiento - Publicar asiento

**Actores:** Contador General, Motor Automático de Posting

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ReversarAsiento - Reversar asiento

**Actores:** Contador General, Motor Automático de Posting

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ReprocesarAsiento - Reprocesar asiento fallido

**Actores:** Motor Automático de Posting, Administrador del Sistema

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_BloquearEdicion - Bloquear edición de asiento publicado

**Actores:** Motor Automático de Posting, Auditor Interno

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_LibroDiario - Consultar libro diario

**Actores:** Contador General, Auditor Externo

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_LibroMayor - Consultar libro mayor

**Actores:** Contador General, Auditor Externo

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_BalanceComprobacion - Consultar balance de comprobación

**Actores:** Contador General, Auditor Externo

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ConciliarSubmayoresGL - Conciliar submayores con GL

**Actores:** Contador General, Motor de Conciliación

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_DetectarDescuadre - Detectar asientos descuadrados

**Actores:** Motor Automático de Posting, Auditor Interno

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_TrazabilidadAsiento - Auditar trazabilidad origen-asiento

**Actores:** Auditor Interno, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

## Contabilidad analítica y control presupuestario

| ID                            | Caso de uso                                   | Actores principales                                  | Propósito                                                                                                                                  | Entidades principales                                      |
| ----------------------------- | --------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `UC_GastoCentroCosto`         | Asignar gasto a centro de costo               | Auxiliar Contable, Contador General                  | Permitir asignar gasto a centro de costo con trazabilidad contable, control de permisos, evidencia y conciliación posterior.               | `accounting_document, journal_entry, journal_entry_line`   |
| `UC_IngresoProfitCenter`      | Asignar ingreso a centro de beneficio         | Contador General, Motor Automático de Posting        | Permitir asignar ingreso a centro de beneficio con trazabilidad contable, control de permisos, evidencia y conciliación posterior.         | `accounting_document, journal_entry, journal_entry_line`   |
| `UC_OrdenInterna`             | Crear orden interna                           | Gerente Financiero, Contador General                 | Permitir crear orden interna con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                           | `accounting_document, journal_entry, journal_entry_line`   |
| `UC_GastoOrdenInterna`        | Imputar gasto a orden interna                 | Auxiliar Contable, Contador General                  | Permitir imputar gasto a orden interna con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                 | `accounting_document, journal_entry, journal_entry_line`   |
| `UC_CrearPresupuesto`         | Crear presupuesto                             | Gerente Financiero, CFO                              | Permitir crear presupuesto con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                             | `accounting_document, journal_entry, journal_entry_line`   |
| `UC_AprobarPresupuesto`       | Aprobar presupuesto                           | CFO, Directorio                                      | Permitir aprobar presupuesto con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                           | `accounting_document, journal_entry, journal_entry_line`   |
| `UC_ControlPresupuesto`       | Controlar ejecución presupuestaria            | Gerente Financiero, CFO                              | Permitir controlar ejecución presupuestaria con trazabilidad contable, control de permisos, evidencia y conciliación posterior.            | `accounting_document, journal_entry, journal_entry_line`   |
| `UC_BloquearGastoPresupuesto` | Bloquear gasto fuera de presupuesto           | Gerente Financiero, Motor Automático de Posting      | Permitir bloquear gasto fuera de presupuesto con trazabilidad contable, control de permisos, evidencia y conciliación posterior.           | `accounting_document, journal_entry, journal_entry_line`   |
| `UC_RentabilidadComercio`     | Analizar rentabilidad por comercio            | Gerente Financiero, Data / BI / ML                   | Permitir analizar rentabilidad por comercio con trazabilidad contable, control de permisos, evidencia y conciliación posterior.            | `business_partner, business_partner_role, contract_header` |
| `UC_RentabilidadCorp`         | Analizar rentabilidad por cliente corporativo | Gerente Financiero, Data / BI / ML                   | Permitir analizar rentabilidad por cliente corporativo con trazabilidad contable, control de permisos, evidencia y conciliación posterior. | `business_partner, business_partner_role, contract_header` |
| `UC_RentabilidadProducto`     | Analizar rentabilidad por producto BNPL       | Gerente Financiero, Data / BI / ML                   | Permitir analizar rentabilidad por producto bnpl con trazabilidad contable, control de permisos, evidencia y conciliación posterior.       | `accounting_document, journal_entry, journal_entry_line`   |
| `UC_CostoRiesgo`              | Analizar costo de riesgo                      | Equipo de Riesgo, Gerente Financiero, Data / BI / ML | Permitir analizar costo de riesgo con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                      | `accounting_document, journal_entry, journal_entry_line`   |
| `UC_ReporteGerencial`         | Generar reporte gerencial                     | Gerente Financiero, CFO, Data / BI / ML              | Permitir generar reporte gerencial con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                     | `accounting_document, journal_entry, journal_entry_line`   |

### UC_GastoCentroCosto - Asignar gasto a centro de costo

**Actores:** Auxiliar Contable, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_IngresoProfitCenter - Asignar ingreso a centro de beneficio

**Actores:** Contador General, Motor Automático de Posting

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_OrdenInterna - Crear orden interna

**Actores:** Gerente Financiero, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_GastoOrdenInterna - Imputar gasto a orden interna

**Actores:** Auxiliar Contable, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CrearPresupuesto - Crear presupuesto

**Actores:** Gerente Financiero, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_AprobarPresupuesto - Aprobar presupuesto

**Actores:** CFO, Directorio

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ControlPresupuesto - Controlar ejecución presupuestaria

**Actores:** Gerente Financiero, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_BloquearGastoPresupuesto - Bloquear gasto fuera de presupuesto

**Actores:** Gerente Financiero, Motor Automático de Posting

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_RentabilidadComercio - Analizar rentabilidad por comercio

**Actores:** Gerente Financiero, Data / BI / ML

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_RentabilidadCorp - Analizar rentabilidad por cliente corporativo

**Actores:** Gerente Financiero, Data / BI / ML

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_RentabilidadProducto - Analizar rentabilidad por producto BNPL

**Actores:** Gerente Financiero, Data / BI / ML

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CostoRiesgo - Analizar costo de riesgo

**Actores:** Equipo de Riesgo, Gerente Financiero, Data / BI / ML

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ReporteGerencial - Generar reporte gerencial

**Actores:** Gerente Financiero, CFO, Data / BI / ML

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

## Impuestos, fiscalidad y cumplimiento local

| ID                     | Caso de uso                                | Actores principales                                        | Propósito                                                                                                                               | Entidades principales                                                |
| ---------------------- | ------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `UC_IVADebito`         | Calcular IVA débito fiscal                 | Contador General                                           | Permitir calcular iva débito fiscal con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                 | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |
| `UC_IVACredito`        | Calcular IVA crédito fiscal                | Contador General                                           | Permitir calcular iva crédito fiscal con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |
| `UC_LiquidarIVA`       | Liquidar IVA mensual                       | Contador General, Gerente Financiero                       | Permitir liquidar iva mensual con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                       | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |
| `UC_CalcularIT`        | Calcular IT                                | Contador General, Gerente Financiero                       | Permitir calcular it con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                                | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |
| `UC_LiquidarIT`        | Liquidar IT mensual                        | Contador General, Gerente Financiero                       | Permitir liquidar it mensual con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                        | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |
| `UC_CalcularIUE`       | Calcular IUE                               | Contador General, Gerente Financiero                       | Permitir calcular iue con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                               | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |
| `UC_CompensarIUEIT`    | Compensar IUE contra IT                    | Contador General, Gerente Financiero                       | Permitir compensar iue contra it con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                    | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |
| `UC_LibroVentas`       | Generar libro de ventas                    | Contador General, SIN Bolivia / SIAT                       | Permitir generar libro de ventas con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                    | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_LibroCompras`      | Generar libro de compras                   | Contador General, SIN Bolivia / SIAT                       | Permitir generar libro de compras con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                   | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_AnexosTributarios` | Generar anexos tributarios                 | Contador General, Legal / Compliance                       | Permitir generar anexos tributarios con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                 | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_Form605`           | Generar Formulario 605 / estados digitales | Contador General, SIN Bolivia / SIAT                       | Permitir generar formulario 605 / estados digitales con trazabilidad contable, control de permisos, evidencia y conciliación posterior. | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |
| `UC_ExportFiscal`      | Exportar información fiscal                | Contador General, SIN Bolivia / SIAT, Regulador Financiero | Permitir exportar información fiscal con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |
| `UC_ObsTributaria`     | Responder observación tributaria           | Legal / Compliance, Contador General, SIN Bolivia / SIAT   | Permitir responder observación tributaria con trazabilidad contable, control de permisos, evidencia y conciliación posterior.           | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_EvidenciaFiscal`   | Mantener evidencia fiscal                  | Legal / Compliance, Contador General                       | Permitir mantener evidencia fiscal con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                  | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |

### UC_IVADebito - Calcular IVA débito fiscal

**Actores:** Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_IVACredito - Calcular IVA crédito fiscal

**Actores:** Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_LiquidarIVA - Liquidar IVA mensual

**Actores:** Contador General, Gerente Financiero

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CalcularIT - Calcular IT

**Actores:** Contador General, Gerente Financiero

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_LiquidarIT - Liquidar IT mensual

**Actores:** Contador General, Gerente Financiero

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CalcularIUE - Calcular IUE

**Actores:** Contador General, Gerente Financiero

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CompensarIUEIT - Compensar IUE contra IT

**Actores:** Contador General, Gerente Financiero

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_LibroVentas - Generar libro de ventas

**Actores:** Contador General, SIN Bolivia / SIAT

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_LibroCompras - Generar libro de compras

**Actores:** Contador General, SIN Bolivia / SIAT

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_AnexosTributarios - Generar anexos tributarios

**Actores:** Contador General, Legal / Compliance

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_Form605 - Generar Formulario 605 / estados digitales

**Actores:** Contador General, SIN Bolivia / SIAT

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ExportFiscal - Exportar información fiscal

**Actores:** Contador General, SIN Bolivia / SIAT, Regulador Financiero

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ObsTributaria - Responder observación tributaria

**Actores:** Legal / Compliance, Contador General, SIN Bolivia / SIAT

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_EvidenciaFiscal - Mantener evidencia fiscal

**Actores:** Legal / Compliance, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

## Cierre contable, estados financieros y reporting

| ID                          | Caso de uso                             | Actores principales                        | Propósito                                                                                                                            | Entidades principales                                                |
| --------------------------- | --------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `UC_ChecklistCierreMensual` | Ejecutar checklist de cierre mensual    | Scheduler de Cierre, Contador General      | Permitir ejecutar checklist de cierre mensual con trazabilidad contable, control de permisos, evidencia y conciliación posterior.    | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_CerrarAR`               | Cerrar submayor AR                      | Contador General, Scheduler de Cierre      | Permitir cerrar submayor ar con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                      | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_CerrarAP`               | Cerrar submayor AP                      | Contador General, Scheduler de Cierre      | Permitir cerrar submayor ap con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                      | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_CerrarBancos`           | Cerrar bancos                           | Tesorero, Scheduler de Cierre              | Permitir cerrar bancos con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                           | `bank_account, bank_statement, payment_order, receipt`               |
| `UC_CerrarActivos`          | Cerrar activos                          | Contador General, Scheduler de Cierre      | Permitir cerrar activos con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                          | `asset_depreciation_run, fixed_asset`                                |
| `UC_CerrarDeuda`            | Cerrar deuda e intereses                | Contador General, Scheduler de Cierre      | Permitir cerrar deuda e intereses con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                | `loan_accrual, loan_contract, loan_schedule`                         |
| `UC_CerrarImpuestos`        | Cerrar impuestos                        | Contador General, Scheduler de Cierre      | Permitir cerrar impuestos con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                        | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_CerrarGL`               | Cerrar GL                               | Contador General, Scheduler de Cierre      | Permitir cerrar gl con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                               | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_ReabrirPeriodo`         | Reabrir periodo con aprobación          | CFO, Contador General                      | Permitir reabrir periodo con aprobación con trazabilidad contable, control de permisos, evidencia y conciliación posterior.          | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_BalanceGeneral`         | Generar balance general                 | Contador General, Auditor Externo          | Permitir generar balance general con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                 | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_EstadoResultados`       | Generar estado de resultados            | Contador General, Auditor Externo          | Permitir generar estado de resultados con trazabilidad contable, control de permisos, evidencia y conciliación posterior.            | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_FlujoEfectivo`          | Generar flujo de efectivo               | Contador General, Auditor Externo          | Permitir generar flujo de efectivo con trazabilidad contable, control de permisos, evidencia y conciliación posterior.               | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_CambiosPatrimonio`      | Generar estado de cambios en patrimonio | Contador General, Auditor Externo          | Permitir generar estado de cambios en patrimonio con trazabilidad contable, control de permisos, evidencia y conciliación posterior. | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_NotasEEFF`              | Generar notas a estados financieros     | Contador General, Auditor Externo          | Permitir generar notas a estados financieros con trazabilidad contable, control de permisos, evidencia y conciliación posterior.     | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |
| `UC_PaqueteDirectorio`      | Generar paquete de directorio           | CFO, Directorio                            | Permitir generar paquete de directorio con trazabilidad contable, control de permisos, evidencia y conciliación posterior.           | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_PaqueteInversionistas`  | Generar paquete para inversionistas     | CFO, Inversionista                         | Permitir generar paquete para inversionistas con trazabilidad contable, control de permisos, evidencia y conciliación posterior.     | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_ReportesIFRS`           | Generar reportes IFRS / gestión         | CFO, Auditor Externo, Regulador Financiero | Permitir generar reportes ifrs / gestión con trazabilidad contable, control de permisos, evidencia y conciliación posterior.         | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_ConsolidarEntidades`    | Consolidar entidades legales            | CFO, Contador General                      | Permitir consolidar entidades legales con trazabilidad contable, control de permisos, evidencia y conciliación posterior.            | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_EliminarIntercompany`   | Eliminar operaciones intercompany       | Contador General, CFO                      | Permitir eliminar operaciones intercompany con trazabilidad contable, control de permisos, evidencia y conciliación posterior.       | `accounting_document, journal_entry, journal_entry_line`             |

### UC_ChecklistCierreMensual - Ejecutar checklist de cierre mensual

**Actores:** Scheduler de Cierre, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CerrarAR - Cerrar submayor AR

**Actores:** Contador General, Scheduler de Cierre

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CerrarAP - Cerrar submayor AP

**Actores:** Contador General, Scheduler de Cierre

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CerrarBancos - Cerrar bancos

**Actores:** Tesorero, Scheduler de Cierre

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CerrarActivos - Cerrar activos

**Actores:** Contador General, Scheduler de Cierre

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CerrarDeuda - Cerrar deuda e intereses

**Actores:** Contador General, Scheduler de Cierre

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CerrarImpuestos - Cerrar impuestos

**Actores:** Contador General, Scheduler de Cierre

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CerrarGL - Cerrar GL

**Actores:** Contador General, Scheduler de Cierre

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ReabrirPeriodo - Reabrir periodo con aprobación

**Actores:** CFO, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_BalanceGeneral - Generar balance general

**Actores:** Contador General, Auditor Externo

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_EstadoResultados - Generar estado de resultados

**Actores:** Contador General, Auditor Externo

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_FlujoEfectivo - Generar flujo de efectivo

**Actores:** Contador General, Auditor Externo

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CambiosPatrimonio - Generar estado de cambios en patrimonio

**Actores:** Contador General, Auditor Externo

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_NotasEEFF - Generar notas a estados financieros

**Actores:** Contador General, Auditor Externo

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_PaqueteDirectorio - Generar paquete de directorio

**Actores:** CFO, Directorio

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_PaqueteInversionistas - Generar paquete para inversionistas

**Actores:** CFO, Inversionista

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ReportesIFRS - Generar reportes IFRS / gestión

**Actores:** CFO, Auditor Externo, Regulador Financiero

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ConsolidarEntidades - Consolidar entidades legales

**Actores:** CFO, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_EliminarIntercompany - Eliminar operaciones intercompany

**Actores:** Contador General, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

## Integración contable con operación BNPL ATLAS

| ID                                 | Caso de uso                                | Actores principales                                      | Propósito                                                                                                                               | Entidades principales                                                                                            |
| ---------------------------------- | ------------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `UC_VentaFinanciada`               | Recibir venta financiada desde comercio    | Comercio Afiliado, Operaciones ATLAS, Outbox / Event Bus | Permitir recibir venta financiada desde comercio con trazabilidad contable, control de permisos, evidencia y conciliación posterior.    | `business_partner, business_partner_role, contract_header`                                                       |
| `UC_PagoInicial60`                 | Registrar pago inicial 60% al comercio     | Consumidor Final, Comercio Afiliado, Operaciones ATLAS   | Permitir registrar pago inicial 60% al comercio con trazabilidad contable, control de permisos, evidencia y conciliación posterior.     | `bank_account, bank_statement, business_partner, business_partner_role, contract_header, payment_order, receipt` |
| `UC_PlanCuotas40`                  | Registrar plan de 3 cuotas del 40%         | Consumidor Final, Operaciones ATLAS                      | Permitir registrar plan de 3 cuotas del 40% con trazabilidad contable, control de permisos, evidencia y conciliación posterior.         | `accounting_document, journal_entry, journal_entry_line`                                                         |
| `UC_PagoDirectoConsumidorComercio` | Registrar pago directo consumidor-comercio | Consumidor Final, Comercio Afiliado, Operaciones ATLAS   | Permitir registrar pago directo consumidor-comercio con trazabilidad contable, control de permisos, evidencia y conciliación posterior. | `bank_account, bank_statement, business_partner, business_partner_role, contract_header, payment_order, receipt` |
| `UC_CuotaVencida`                  | Detectar cuota vencida                     | Motor de Cobranza, Equipo de Cobranza                    | Permitir detectar cuota vencida con trazabilidad contable, control de permisos, evidencia y conciliación posterior.                     | `accounting_document, journal_entry, journal_entry_line`                                                         |
| `UC_PagoATLASComercio`             | Pagar cuota al comercio por incumplimiento | Operaciones ATLAS, Tesorero, Comercio Afiliado           | Permitir pagar cuota al comercio por incumplimiento con trazabilidad contable, control de permisos, evidencia y conciliación posterior. | `business_partner, business_partner_role, contract_header`                                                       |
| `UC_CxCConsumidor`                 | Crear cuenta por cobrar al consumidor      | Equipo de Cobranza, Motor Automático de Posting          | Permitir crear cuenta por cobrar al consumidor con trazabilidad contable, control de permisos, evidencia y conciliación posterior.      | `accounting_document, journal_entry, journal_entry_line`                                                         |
| `UC_ActivarCobranzaConsumidor`     | Activar cobranza al consumidor             | Motor de Cobranza, Equipo de Cobranza, Consumidor Final  | Permitir activar cobranza al consumidor con trazabilidad contable, control de permisos, evidencia y conciliación posterior.             | `accounting_document, ar_invoice, electronic_tax_document, tax_code`                                             |
| `UC_RecuperarCuotaCubierta`        | Registrar recuperación de cuota cubierta   | Equipo de Cobranza, Tesorero, Consumidor Final           | Permitir registrar recuperación de cuota cubierta con trazabilidad contable, control de permisos, evidencia y conciliación posterior.   | `accounting_document, journal_entry, journal_entry_line`                                                         |
| `UC_ReconocerMDR`                  | Reconocer MDR de venta financiada          | Motor Automático de Posting, Contador General            | Permitir reconocer mdr de venta financiada con trazabilidad contable, control de permisos, evidencia y conciliación posterior.          | `accounting_document, ar_invoice, electronic_tax_document, tax_code`                                             |
| `UC_LiquidacionComercio`           | Registrar liquidación con comercio         | Operaciones ATLAS, Comercio Afiliado                     | Permitir registrar liquidación con comercio con trazabilidad contable, control de permisos, evidencia y conciliación posterior.         | `business_partner, business_partner_role, contract_header`                                                       |
| `UC_ConciliarLiquidacionComercio`  | Conciliar liquidación comercio             | Operaciones ATLAS, Motor de Conciliación                 | Permitir conciliar liquidación comercio con trazabilidad contable, control de permisos, evidencia y conciliación posterior.             | `business_partner, business_partner_role, contract_header`                                                       |
| `UC_CohorteRiesgoCompra`           | Etiquetar compra por cohorte y riesgo      | Equipo de Riesgo, Motor de Riesgo / Scoring              | Permitir etiquetar compra por cohorte y riesgo con trazabilidad contable, control de permisos, evidencia y conciliación posterior.      | `accounting_document, journal_entry, journal_entry_line`                                                         |
| `UC_EnviarDataRiesgo`              | Enviar datos a analítica de riesgo         | Equipo de Riesgo, Data / BI / ML, API Buró / Riesgo      | Permitir enviar datos a analítica de riesgo con trazabilidad contable, control de permisos, evidencia y conciliación posterior.         | `accounting_document, journal_entry, journal_entry_line`                                                         |

### UC_VentaFinanciada - Recibir venta financiada desde comercio

**Actores:** Comercio Afiliado, Operaciones ATLAS, Outbox / Event Bus

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_PagoInicial60 - Registrar pago inicial 60% al comercio

**Actores:** Consumidor Final, Comercio Afiliado, Operaciones ATLAS

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_PlanCuotas40 - Registrar plan de 3 cuotas del 40%

**Actores:** Consumidor Final, Operaciones ATLAS

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_PagoDirectoConsumidorComercio - Registrar pago directo consumidor-comercio

**Actores:** Consumidor Final, Comercio Afiliado, Operaciones ATLAS

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CuotaVencida - Detectar cuota vencida

**Actores:** Motor de Cobranza, Equipo de Cobranza

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_PagoATLASComercio - Pagar cuota al comercio por incumplimiento

**Actores:** Operaciones ATLAS, Tesorero, Comercio Afiliado

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CxCConsumidor - Crear cuenta por cobrar al consumidor

**Actores:** Equipo de Cobranza, Motor Automático de Posting

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ActivarCobranzaConsumidor - Activar cobranza al consumidor

**Actores:** Motor de Cobranza, Equipo de Cobranza, Consumidor Final

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_RecuperarCuotaCubierta - Registrar recuperación de cuota cubierta

**Actores:** Equipo de Cobranza, Tesorero, Consumidor Final

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ReconocerMDR - Reconocer MDR de venta financiada

**Actores:** Motor Automático de Posting, Contador General

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_LiquidacionComercio - Registrar liquidación con comercio

**Actores:** Operaciones ATLAS, Comercio Afiliado

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ConciliarLiquidacionComercio - Conciliar liquidación comercio

**Actores:** Operaciones ATLAS, Motor de Conciliación

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CohorteRiesgoCompra - Etiquetar compra por cohorte y riesgo

**Actores:** Equipo de Riesgo, Motor de Riesgo / Scoring

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_EnviarDataRiesgo - Enviar datos a analítica de riesgo

**Actores:** Equipo de Riesgo, Data / BI / ML, API Buró / Riesgo

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

## Auditoría, control interno y seguridad

| ID                            | Caso de uso                      | Actores principales                                  | Propósito                                                                                                                     | Entidades principales                                                |
| ----------------------------- | -------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `UC_BitacoraAuditoria`        | Consultar bitácora de auditoría  | Auditor Interno, Auditor Externo                     | Permitir consultar bitácora de auditoría con trazabilidad contable, control de permisos, evidencia y conciliación posterior.  | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |
| `UC_SegregacionFunciones`     | Validar segregación de funciones | Auditor Interno, Administrador del Sistema           | Permitir validar segregación de funciones con trazabilidad contable, control de permisos, evidencia y conciliación posterior. | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_AprobarOperacionSensible` | Aprobar operación sensible       | CFO, Auditor Interno                                 | Permitir aprobar operación sensible con trazabilidad contable, control de permisos, evidencia y conciliación posterior.       | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_EvidenciaDocumental`      | Revisar evidencia documental     | Auditor Interno, Auditor Externo, Legal / Compliance | Permitir revisar evidencia documental con trazabilidad contable, control de permisos, evidencia y conciliación posterior.     | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_AuditarConfig`            | Auditar cambios de configuración | Auditor Interno                                      | Permitir auditar cambios de configuración con trazabilidad contable, control de permisos, evidencia y conciliación posterior. | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |
| `UC_AuditarReglasPosting`     | Auditar reglas de posting        | Auditor Interno                                      | Permitir auditar reglas de posting con trazabilidad contable, control de permisos, evidencia y conciliación posterior.        | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |
| `UC_AuditarReversos`          | Auditar reversos contables       | Auditor Interno                                      | Permitir auditar reversos contables con trazabilidad contable, control de permisos, evidencia y conciliación posterior.       | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |
| `UC_AuditarConciliaciones`    | Auditar conciliaciones           | Auditor Interno                                      | Permitir auditar conciliaciones con trazabilidad contable, control de permisos, evidencia y conciliación posterior.           | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |
| `UC_PapelesTrabajo`           | Exportar papeles de trabajo      | Auditor Interno, Auditor Externo                     | Permitir exportar papeles de trabajo con trazabilidad contable, control de permisos, evidencia y conciliación posterior.      | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_HallazgoAuditoria`        | Gestionar hallazgo de auditoría  | Auditor Interno                                      | Permitir gestionar hallazgo de auditoría con trazabilidad contable, control de permisos, evidencia y conciliación posterior.  | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |
| `UC_CerrarHallazgo`           | Cerrar hallazgo de auditoría     | Auditor Interno, CFO                                 | Permitir cerrar hallazgo de auditoría con trazabilidad contable, control de permisos, evidencia y conciliación posterior.     | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |
| `UC_SnapshotsCierre`          | Congelar snapshots de cierre     | Scheduler de Cierre, Auditor Interno                 | Permitir congelar snapshots de cierre con trazabilidad contable, control de permisos, evidencia y conciliación posterior.     | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_HashDocumentos`           | Verificar hash de documentos     | Auditor Interno, Auditor Externo                     | Permitir verificar hash de documentos con trazabilidad contable, control de permisos, evidencia y conciliación posterior.     | `accounting_document, journal_entry, journal_entry_line`             |

### UC_BitacoraAuditoria - Consultar bitácora de auditoría

**Actores:** Auditor Interno, Auditor Externo

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_SegregacionFunciones - Validar segregación de funciones

**Actores:** Auditor Interno, Administrador del Sistema

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_AprobarOperacionSensible - Aprobar operación sensible

**Actores:** CFO, Auditor Interno

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_EvidenciaDocumental - Revisar evidencia documental

**Actores:** Auditor Interno, Auditor Externo, Legal / Compliance

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_AuditarConfig - Auditar cambios de configuración

**Actores:** Auditor Interno

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_AuditarReglasPosting - Auditar reglas de posting

**Actores:** Auditor Interno

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_AuditarReversos - Auditar reversos contables

**Actores:** Auditor Interno

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_AuditarConciliaciones - Auditar conciliaciones

**Actores:** Auditor Interno

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_PapelesTrabajo - Exportar papeles de trabajo

**Actores:** Auditor Interno, Auditor Externo

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_HallazgoAuditoria - Gestionar hallazgo de auditoría

**Actores:** Auditor Interno

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_CerrarHallazgo - Cerrar hallazgo de auditoría

**Actores:** Auditor Interno, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_SnapshotsCierre - Congelar snapshots de cierre

**Actores:** Scheduler de Cierre, Auditor Interno

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_HashDocumentos - Verificar hash de documentos

**Actores:** Auditor Interno, Auditor Externo

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

## APIs, eventos, outbox y escalabilidad

| ID                     | Caso de uso                           | Actores principales                                    | Propósito                                                                                                                          | Entidades principales                                                |
| ---------------------- | ------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `UC_PublicarEvento`    | Publicar evento contable              | Outbox / Event Bus, Motor Automático de Posting        | Permitir publicar evento contable con trazabilidad contable, control de permisos, evidencia y conciliación posterior.              | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_ConsumirEvento`    | Consumir evento operativo             | Outbox / Event Bus, Motor Automático de Posting        | Permitir consumir evento operativo con trazabilidad contable, control de permisos, evidencia y conciliación posterior.             | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_Idempotencia`      | Garantizar idempotencia               | Administrador del Sistema, Outbox / Event Bus          | Permitir garantizar idempotencia con trazabilidad contable, control de permisos, evidencia y conciliación posterior.               | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_Outbox`            | Registrar outbox financiero           | Outbox / Event Bus, Motor Automático de Posting        | Permitir registrar outbox financiero con trazabilidad contable, control de permisos, evidencia y conciliación posterior.           | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_ReintentoEvento`   | Reintentar evento fallido             | Outbox / Event Bus, Administrador del Sistema          | Permitir reintentar evento fallido con trazabilidad contable, control de permisos, evidencia y conciliación posterior.             | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_MonitorearEventos` | Monitorear cola de eventos            | Administrador del Sistema, Outbox / Event Bus          | Permitir monitorear cola de eventos con trazabilidad contable, control de permisos, evidencia y conciliación posterior.            | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |
| `UC_ParticionPeriodo`  | Particionar transacciones por periodo | Administrador del Sistema                              | Permitir particionar transacciones por periodo con trazabilidad contable, control de permisos, evidencia y conciliación posterior. | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_ParticionEntidad`  | Particionar por entidad legal         | Administrador del Sistema                              | Permitir particionar por entidad legal con trazabilidad contable, control de permisos, evidencia y conciliación posterior.         | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_LogsIntegracion`   | Generar logs de integración           | Administrador del Sistema, Outbox / Event Bus          | Permitir generar logs de integración con trazabilidad contable, control de permisos, evidencia y conciliación posterior.           | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_APIEstadoCuenta`   | Exponer API de estado de cuenta       | Cliente Corporativo, Comercio Afiliado, Data / BI / ML | Permitir exponer api de estado de cuenta con trazabilidad contable, control de permisos, evidencia y conciliación posterior.       | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_APIFacturacion`    | Exponer API de facturación            | API Facturación Electrónica, Data / BI / ML            | Permitir exponer api de facturación con trazabilidad contable, control de permisos, evidencia y conciliación posterior.            | `accounting_document, ar_invoice, electronic_tax_document, tax_code` |
| `UC_APIConciliacion`   | Exponer API de conciliación           | API Bancaria, Data / BI / ML                           | Permitir exponer api de conciliación con trazabilidad contable, control de permisos, evidencia y conciliación posterior.           | `accounting_document, journal_entry, journal_entry_line`             |
| `UC_APIReporting`      | Exponer API de reporting financiero   | Data / BI / ML, CFO                                    | Permitir exponer api de reporting financiero con trazabilidad contable, control de permisos, evidencia y conciliación posterior.   | `accounting_document, journal_entry, journal_entry_line`             |

### UC_PublicarEvento - Publicar evento contable

**Actores:** Outbox / Event Bus, Motor Automático de Posting

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ConsumirEvento - Consumir evento operativo

**Actores:** Outbox / Event Bus, Motor Automático de Posting

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_Idempotencia - Garantizar idempotencia

**Actores:** Administrador del Sistema, Outbox / Event Bus

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_Outbox - Registrar outbox financiero

**Actores:** Outbox / Event Bus, Motor Automático de Posting

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ReintentoEvento - Reintentar evento fallido

**Actores:** Outbox / Event Bus, Administrador del Sistema

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_MonitorearEventos - Monitorear cola de eventos

**Actores:** Administrador del Sistema, Outbox / Event Bus

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ParticionPeriodo - Particionar transacciones por periodo

**Actores:** Administrador del Sistema

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_ParticionEntidad - Particionar por entidad legal

**Actores:** Administrador del Sistema

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_LogsIntegracion - Generar logs de integración

**Actores:** Administrador del Sistema, Outbox / Event Bus

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_APIEstadoCuenta - Exponer API de estado de cuenta

**Actores:** Cliente Corporativo, Comercio Afiliado, Data / BI / ML

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_APIFacturacion - Exponer API de facturación

**Actores:** API Facturación Electrónica, Data / BI / ML

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_APIConciliacion - Exponer API de conciliación

**Actores:** API Bancaria, Data / BI / ML

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.

### UC_APIReporting - Exponer API de reporting financiero

**Actores:** Data / BI / ML, CFO

**Precondiciones:**

- Entidad legal, periodo contable y ledger definidos.
- Usuario autenticado con permisos suficientes.
- Reglas vigentes de negocio, impuesto y contabilización cuando aplique.

**Flujo principal:**

1. Iniciar la acción desde portal, API o batch.
2. Validar permisos, datos maestros, periodo y estado del documento.
3. Registrar el documento de origen o solicitud operacional.
4. Ejecutar reglas de cálculo, impuesto, aprobación o contabilización.
5. Persistir trazabilidad, bitácora y evento outbox.

**Excepciones:** periodo cerrado, datos maestros incompletos, documento duplicado, regla vencida, diferencia de conciliación o aprobación pendiente.
