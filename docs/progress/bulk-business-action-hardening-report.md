# Endurecimiento de acciones de negocio y modo BULK

## 1. Objetivo

Verificar y corregir que el backend integrado no sea un conjunto de CRUDs simples, sino una API con casos de uso productivos que puedan impactar múltiples tablas, registrar auditoría de negocio y admitir operaciones batch/múltiples registros cuando el flujo lo exige.

## 2. Hallazgos del ZIP anterior

| Hallazgo                                       | Estado anterior                                                                          | Riesgo                                                                                                                  | Acción aplicada                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Business action log transversal                | No existía un modelo común para acciones de negocio entre módulos                        | Los logs técnicos Pino y auditorías por dominio no bastaban para responder qué proceso de negocio impactó varias tablas | Se agregó `atlas_audit.business_action_logs` y `BusinessActionLogsModule` |
| Endpoints BULK explícitos                      | Había `bulkCreate` internos en servicios, pero pocos endpoints batch de contrato público | El frontend/importadores tendrían que iterar N requests y perder correlación transaccional                              | Se agregaron 4 endpoints bulk con Zod, roles y transacciones              |
| Documentación de no-CRUD                       | Existían flujos complejos, pero no estaban resaltados como garantía de arquitectura      | Podía interpretarse erróneamente como backend CRUD                                                                      | Se documentó en endpoints, arquitectura y flujos                          |
| Auditoría de negocio separada de logs normales | Existían Pino, audit logs de Ads, CRM y contabilidad, pero no una bitácora transversal   | Trazabilidad partida para batches y procesos cross-module                                                               | Se agregó consulta `GET /api/v1/audit/business-actions`                   |

## 3. Implementación aplicada

### Modelo agregado

- `src/database/models/business_action_log.model.ts`
- Tabla: `atlas_audit.business_action_logs`
- Migración: `src/database/migrations/20260709010000-create-business-action-logs.sql`

Campos principales:

- `moduleCode`
- `businessProcess`
- `actionCode`
- `actorUserId`
- `actorRole`
- `aggregateType`
- `aggregateId`
- `correlationId`
- `requestId`
- `affectedTables`
- `affectedRecordCount`
- `status`
- `inputSummary`
- `outputSummary`
- `errorCode`
- `errorMessage`
- `createdAt`

### Módulo agregado

- `src/modules/business-action-logs/business-action-logs.module.ts`
- `src/modules/business-action-logs/business-action-logs.service.ts`
- `src/modules/business-action-logs/business-action-logs.controller.ts`
- `src/modules/business-action-logs/business-action-logs.schemas.ts`
- `src/modules/business-action-logs/business-action-logs.types.ts`
- `src/modules/business-action-logs/README.md`

### Endpoint de consulta agregado

```txt
GET /api/v1/audit/business-actions
```

Permite filtrar por:

```txt
page, pageSize, moduleCode, businessProcess, actionCode, status, aggregateType, aggregateId, actorUserId, correlationId, from, to
```

## 4. Endpoints BULK agregados

| Endpoint                                  |          Límite | Transacción | Tablas principales impactadas                                                                                              |
| ----------------------------------------- | --------------: | ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/b2b/accounts/bulk`          |     100 cuentas | Sí          | `b2b_accounts`, `b2b_contacts`, `audit_logs`, `business_action_logs`                                                       |
| `POST /api/v1/accounting/documents/bulk`  |   50 documentos | Sí          | `accounting_document`, `journal_entry`, `journal_entry_line`, `document_audit_log`, `event_outbox`, `business_action_logs` |
| `POST /api/v1/admin/ads/advertisers/bulk` | 100 anunciantes | Sí          | `ad_advertiser_accounts`, `ad_audit_log`, `business_action_logs`                                                           |
| `POST /api/v1/ads/events/bulk`            |     500 eventos | Sí          | `ad_events`, `ad_spend_ledger`, `ad_campaigns`, `business_action_logs`                                                     |

## 5. Endpoints existentes que ya eran no-CRUD

El backend ya incluía casos de uso que impactan varias tablas:

- `POST /api/v1/b2b/accounts`: cuenta + contacto principal + audit log + business action log.
- `POST /api/v1/b2b/proposals`: propuesta + líneas + aprobaciones.
- `POST /api/v1/b2b/contracts/from-proposal`: contrato derivado de propuesta.
- `POST /api/v1/b2b/bnpl/purchases`: compra + cuotas + cuentas por cobrar.
- `POST /api/v1/accounting/documents`: documento + asiento + líneas + document audit + outbox + business action log.
- `PATCH /api/v1/accounting/documents/:id/post`: cambio de estado + hash + journal + audit + outbox.
- `POST /api/v1/accounting/documents/:id/reverse`: reverso contable + publicación + actualización del documento original.
- `POST /api/v1/accounting/receipts`: recibo + asignaciones + actualización de facturas + documento contable.
- `POST /api/v1/ads/events`: evento + reserva de presupuesto + spend ledger.
- `POST /api/v1/admin/ads/billing/period-close`: agrupación de ledger + facturas + líneas + auditoría.

## 6. Faltantes que quedan como extensión recomendada

Estos no bloquean la solicitud actual porque ya existe soporte BULK real, pero conviene agregarlos si el frontend o los importadores los necesitan:

| Faltante recomendado                                                         | Motivo                                                                                       | Prioridad                          |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------- |
| `POST /api/v1/b2b/proposals/bulk`                                            | Carga masiva de propuestas comerciales desde campañas B2B                                    | Media                              |
| `POST /api/v1/b2b/bnpl/purchases/bulk`                                       | Registro masivo de compras BNPL desde POS o integración externa                              | Alta cuando exista integración POS |
| `POST /api/v1/accounting/receipts/bulk`                                      | Carga masiva de recibos desde extractos o pasarela bancaria                                  | Media                              |
| `POST /api/v1/admin/ads/inventory/bulk`                                      | Alta masiva de placements por canal/superficie                                               | Baja-media                         |
| `POST /api/v1/admin/ads/policies/bulk`                                       | Carga masiva de políticas de moderación                                                      | Baja                               |
| Registro `FAILED` en `business_action_logs` para fallos fuera de transacción | Hoy se registran acciones exitosas dentro de transacción; los errores quedan en Pino/filters | Media                              |

## 7. Validación ejecutada

```txt
npm ci                    OK
npm run type-check        OK
npm run lint              OK
npm test                  OK - 8 suites / 35 tests
npm run test:e2e          OK - 1 suite / 2 tests
npm run build             OK
npm run audit:use-cases   OK - 258 casos auditados
npx prettier --check .    OK
npm audit --omit=dev      OK - 0 vulnerabilities
```

## 8. Estado

Corregido y listo para revisión técnica. No se ejecutó smoke contra PostgreSQL real porque el entorno no tiene una base de datos ATLAS levantada con `.env` productivo.
