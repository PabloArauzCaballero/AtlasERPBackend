# Revisión detallada frontend ATLAS ERP

## Alcance

Se revisó la capa `frontend/atlas-erp-web` completa contra los controllers y schemas Zod reales del backend NestJS.

## Hallazgos corregidos

| Área            | Problema detectado                                                                                                        | Corrección implementada                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Portal comercio | Compra BNPL usaba `amount` y omitía `consumerId`, pagos 60/40 e installments.                                             | Payload demo alineado con `registerPurchaseSchema`.                                                       |
| Portal comercio | Sucursales/usuarios usaban `addressLine` y `role`.                                                                        | Se cambió a `address` y `roleCode`.                                                                       |
| CRM B2B         | Oportunidades omitían `ownerUserId`; cambio de etapa enviaba campo no usado.                                              | Payload ajustado a `createOpportunitySchema` y `moveOpportunityStageSchema`.                              |
| CRM B2B         | Aprobaciones enviaban `decision`; backend espera `status`.                                                                | Payload corregido a `{ status, reason }`.                                                                 |
| CRM B2B         | Contratos desde propuesta omitían `startDate`; activación omitía `approvedByUserId`.                                      | Payloads corregidos a schemas reales.                                                                     |
| CRM B2B         | Onboarding omitía `checklistItems`; checklist enviaba `checklistItem` en vez de `checklistItemId`.                        | Payloads corregidos a schemas reales.                                                                     |
| CRM B2B         | Cobertura y facturación usaban nombres de campos anteriores al backend actual.                                            | Payloads actualizados a `scheduleCoverageSchema`, `issueInvoiceSchema` y `registerMerchantPaymentSchema`. |
| Contabilidad    | Business partners, contratos, periodos, ledgers, COA, impuestos, recibos y documentos usaban campos no aceptados por Zod. | Todos los payloads demo se alinearon con `accounting.schemas.ts`.                                         |
| Ads             | Algunos filtros permitidos en services no coincidían con schemas Zod del backend.                                         | `adsService` ahora usa whitelists reales: `status`, `surface`, `category`, `isActive`, `severity`, etc.   |
| Tablas          | Había paginación server-side en services, pero no controles visibles en UI.                                               | `ResourceList` ahora muestra selector de tamaño, página actual y botones anterior/siguiente.              |
| UX/API          | La búsqueda disparaba requests por cada tecla.                                                                            | Se agregó debounce especializado con `useDebouncedValue`.                                                 |

## Reglas de arquitectura verificadas

- `fetch` sigue existiendo solo en `lib/apiClient.ts`.
- Las vistas consumen backend exclusivamente por `services/`.
- No se mezclaron permisos entre Portal comercio y Panel operaciones.
- No se crearon endpoints frontend que no tengan controller real.
- Ningún archivo TypeScript/TSX supera 300 líneas.

## Brechas que siguen correctamente bloqueadas

No se implementaron falsos acoples para:

- Usuarios, roles y permisos administrables.
- Notificaciones.
- Búsqueda global federada.

Estas vistas siguen como `BackendGap` hasta que exista contrato backend real.
