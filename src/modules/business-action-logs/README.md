# Módulo Business Action Logs

## Responsabilidad

Registra acciones de negocio auditables, separadas de los logs técnicos de Pino y de los logs HTTP. Este módulo sirve para responder qué proceso de negocio impactó qué tablas, quién lo ejecutó, cuántos registros afectó y bajo qué correlación/batch.

## Archivos

- `business-action-logs.module.ts`: registra el modelo Sequelize, controller y service del módulo.
- `business-action-logs.controller.ts`: expone la consulta administrativa de acciones de negocio.
- `business-action-logs.service.ts`: escribe y consulta logs de acción de negocio.
- `business-action-logs.schemas.ts`: valida filtros de consulta con Zod.
- `business-action-logs.types.ts`: define el contrato interno de escritura.

## Qué no debe ir aquí

No debe reemplazar los logs técnicos, trazas HTTP, auditorías fiscales específicas ni auditorías propias de Ads/CRM. Es una bitácora transversal de negocio para acciones multi-tabla, batches y flujos críticos.

## Qué se registra hoy (`action_code`)

Lista verificada contra el código el 2026-09-29 (WP14-ERPB). Lo que no está aquí NO se registra.

| Módulo       | `action_code`                                                                            | Dónde                                                  |
| ------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `ACCOUNTING` | `CLOSE_ACCOUNTING_PERIOD`, `REOPEN_ACCOUNTING_PERIOD` (con motivo y quién había cerrado) | `closing.service.ts`                                   |
| `ACCOUNTING` | `ISSUE_AR_INVOICE`, `DELETE_DRAFT_AR_INVOICE`                                            | `billing.service.ts`                                   |
| `ACCOUNTING` | `RECORD_RECEIPT`, `DELETE_DRAFT_RECEIPT`                                                 | `receipts.service.ts`                                  |
| `ACCOUNTING` | `CREATE_ACCOUNTING_DRAFT_WITH_JOURNAL` y la aprobación de documentos                     | `accounting-documents.service.ts`                      |
| `ACCOUNTING` | reenvío de eventos del outbox                                                            | `outbox-operations.service.ts`                         |
| `CRM`        | `MOVE_OPPORTUNITY_STAGE`                                                                 | `b2b-pipeline.service.ts`                              |
| `CRM`        | `DECIDE_APPROVAL_REQUEST`                                                                | `b2b-pipeline.service.ts`                              |
| `CRM`        | `SIGN_AND_ACTIVATE_CONTRACT`                                                             | `b2b-contracts.service.ts`                             |
| `CRM`        | `REGISTER_PAYABLE_SETTLEMENT`, `APPROVE_PAYABLE_SETTLEMENT`, `REJECT_PAYABLE_SETTLEMENT` | `b2b-coverage.service.ts`                              |
| `CRM`        | cuentas B2B y onboarding                                                                 | `b2b-accounts.service.ts`, `b2b-onboarding.service.ts` |
| `ADS`        | acciones administrativas y entrega                                                       | `admin-ads.service.ts`, `delivery.service.ts`          |
| `PORTAL`     | planes del comercio y sucursales (`CREATE_MERCHANT_PLAN`, `PORTAL_CREATE_BRANCH`…)       | `portal.service.ts`                                    |

No se registran: contactos, etiquetas y actividades comerciales de una cuenta; anulación fiscal
de facturas ante el SIN (tiene su propia bitácora fiscal); cobros de recuperación.
