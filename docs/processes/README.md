<!-- Generado desde AtlasBackend/src/modules/workflow-catalog/definitions (plan de procesos 2026-09-26). No editar a mano: se regenera. -->

# Procesos que pasan por AtlasERPBackend

La fuente de los procesos de Atlas es **AtlasBackend** (`src/modules/workflow-catalog/definitions/`, validada por gates en CI) y se consulta en el portal admin, sección **Procesos**. Aquí sólo están los pasos que ejecuta este bloque: 16 procesos. Si un paso de esta lista cambia de ruta, hay que cambiar también su proceso en AtlasBackend (`check:process-steps` lo detecta en la siguiente regeneración de Flujos).

## P-06 · Línea de crédito, solicitud y decisión de crédito por el Motor

`credit_line_and_application` · prioridad **P0** · dueño `RISK_MANAGER` · ficha: [AtlasBackend/docs/processes/credit_line_and_application.md](https://github.com/PabloArauzCaballero/AtlasBackend/blob/dev/docs/processes/credit_line_and_application.md)

| Etapa | Paso | Operación |
|---|---|---|
| Aceptación del comercio | Ver las compras que esperan respuesta | `GET /merchant-credit/:partnerId/applications` |
| Aceptación del comercio | Aceptar o rechazar la compra | `POST /merchant-credit/:partnerId/applications/:applicationId/acceptance` |

## P-08 · Compra con QR del comercio y desembolso del préstamo

`purchase_and_disbursement` · prioridad **P0** · dueño `OPERATIONS_MANAGER` · ficha: [AtlasBackend/docs/processes/purchase_and_disbursement.md](https://github.com/PabloArauzCaballero/AtlasBackend/blob/dev/docs/processes/purchase_and_disbursement.md)

| Etapa | Paso | Operación |
|---|---|---|
| Decisión del Motor | El ERP recibe el evento de Core | `POST /integration/core/events` |
| El comercio acepta o rechaza la venta | Solicitudes pendientes del comercio (ERP) | `GET /merchant-credit/:partnerId/applications` |
| El comercio acepta o rechaza la venta | Aceptar o rechazar (ERP) | `POST /merchant-credit/:partnerId/applications/:applicationId/acceptance` |
| El comercio ve la venta en su cartera | Cartera del comercio (ERP) | `GET /merchant-credit/:partnerId/portfolio` |
| Registro de la venta a plazos en el ERP | Registrar la compra BNPL | `POST /b2b/bnpl/purchases` |

## P-09 · Pago de cuota con QR del comercio, comprobante y verificación

`installment_payment_claims` · prioridad **P0** · dueño `OPERATIONS_MANAGER` · ficha: [AtlasBackend/docs/processes/installment_payment_claims.md](https://github.com/PabloArauzCaballero/AtlasBackend/blob/dev/docs/processes/installment_payment_claims.md)

| Etapa | Paso | Operación |
|---|---|---|
| Entrega del aviso al comercio y al ERP | El ERP registra el aviso | `POST /integration/core/events` |
| Verificación del comercio | Listar los comprobantes por verificar | `GET /merchant-credit/:partnerId/payment-claims` |
| Verificación del comercio | Ver el comprobante | `GET /merchant-credit/:partnerId/payment-claims/:claimId/proof` |
| Verificación del comercio | Confirmar o rechazar el comprobante | `POST /merchant-credit/:partnerId/payment-claims/:claimId/verification` |
| Cartera del comercio | Ver la cartera en el portal del comercio | `GET /merchant-credit/:partnerId/portfolio` |
| La decisión llega al cliente y al ERP | El ERP concilia la cuota | `POST /integration/core/events` |

## P-12 · Soporte: casos, chat, mesa de ayuda, SLA y base de conocimiento

`customer_support_case` · prioridad **P0** · dueño `OPERATIONS_MANAGER` · ficha: [AtlasBackend/docs/processes/customer_support_case.md](https://github.com/PabloArauzCaballero/AtlasBackend/blob/dev/docs/processes/customer_support_case.md)

| Etapa | Paso | Operación |
|---|---|---|
| El comercio pide ayuda | Listar los motivos del comercio | `GET /merchant/support/categories` |
| El comercio pide ayuda | Abrir un caso con motivo | `POST /merchant/support/cases` |
| El comercio pide ayuda | Abrir el chat del comercio | `POST /support/channels` |
| El comercio pide ayuda | Enviar un mensaje del comercio | `POST /support/channels/:channelId/messages` |
| El cliente cierra el ciclo | Calificar la atención (comercio) | `POST /merchant/support/cases/:caseId/feedback` |

## P-13 · Notificaciones transaccionales y campañas masivas

`notifications_and_campaigns` · prioridad **P1** · dueño `OPERATIONS_MANAGER` · ficha: [AtlasBackend/docs/processes/notifications_and_campaigns.md](https://github.com/PabloArauzCaballero/AtlasBackend/blob/dev/docs/processes/notifications_and_campaigns.md)

| Etapa | Paso | Operación |
|---|---|---|
| Armar y programar la campaña en el ERP | Consultar segmentos de audiencia | `GET /admin/notification-campaigns/segments` |
| Armar y programar la campaña en el ERP | Crear un segmento | `POST /admin/notification-campaigns/segments` |
| Armar y programar la campaña en el ERP | Editar un segmento | `PATCH /admin/notification-campaigns/segments/:segmentId` |
| Armar y programar la campaña en el ERP | Crear la campaña en borrador | `POST /admin/notification-campaigns` |
| Armar y programar la campaña en el ERP | Estimar el alcance | `POST /admin/notification-campaigns/audience/estimate` |
| Armar y programar la campaña en el ERP | Editar la campaña | `PATCH /admin/notification-campaigns/:campaignId` |
| Armar y programar la campaña en el ERP | Probar, programar, pausar, reanudar, cancelar o duplicar | `POST /admin/notification-campaigns/:campaignId/:action` |
| Seguimiento de resultados en el ERP | Listar campañas | `GET /admin/notification-campaigns` |
| Seguimiento de resultados en el ERP | Ver una campaña | `GET /admin/notification-campaigns/:campaignId` |
| Seguimiento de resultados en el ERP | Ver los mensajes de la campaña | `GET /admin/notification-campaigns/:campaignId/messages` |

## P-16 · Alta de comercio: ERP pide → Motor decide (KYB) → Portal concede → ERP acusa y opera

`merchant_onboarding_chain` · prioridad **P0** · dueño `OPERATIONS_MANAGER` · ficha: [AtlasBackend/docs/processes/merchant_onboarding_chain.md](https://github.com/PabloArauzCaballero/AtlasBackend/blob/dev/docs/processes/merchant_onboarding_chain.md)

| Etapa | Paso | Operación |
|---|---|---|
| El ERP abre el caso de onboarding | Abrir el caso de onboarding | `POST /b2b/onboarding/cases` |
| El ERP abre el caso de onboarding | Ver la cola de casos | `GET /b2b/onboarding/cases` |
| El ERP abre el caso de onboarding | Leer el mini-tablero de la cola | `GET /b2b/onboarding/cases/summary` |
| El comercio completa su expediente | Abrir el expediente (pasarela del ERP) | `POST /partner-onboarding/start` |
| El comercio completa su expediente | Declarar el representante legal | `POST /partner-onboarding/:partnerId/legal-representative` |
| El comercio completa su expediente | Registrar la matrícula de comercio | `POST /partner-onboarding/:partnerId/commercial-registry` |
| El comercio completa su expediente | Completar la ficha comercial | `PATCH /partner-onboarding/:partnerId/commercial-profile` |
| El comercio completa su expediente | Ver qué falta para enviar | `GET /partner-onboarding/:partnerId/status` |
| El comercio completa su expediente | Enviar el expediente (pasarela del ERP) | `POST /partner-onboarding/:partnerId/submit` |
| El ERP enlaza el expediente y pide la verificación | Enlazar el caso con el expediente de Atlas | `POST /b2b/onboarding/cases/:onboardingCaseId/partner-link` |
| El ERP enlaza el expediente y pide la verificación | Pedir la verificación del comercio | `POST /b2b/onboarding/cases/:onboardingCaseId/kyb-review` |
| El veredicto vuelve al expediente y al caso | Sincronizar el veredicto en el caso del ERP | `POST /b2b/onboarding/cases/:onboardingCaseId/kyb-review/sync` |
| El veredicto vuelve al expediente y al caso | Acusar en lote los casos que esperan | `POST /b2b/onboarding/cases/reconcile-pending` |
| El ERP pide el acceso de las personas del comercio | Dar acceso a una persona del comercio | `POST /b2b/onboarding/merchant-users` |
| El ERP acusa las credenciales | Acusar las credenciales del caso | `POST /b2b/onboarding/cases/:onboardingCaseId/identity/reconcile` |
| El ERP pacta contrato, comisión y checklist | Leer el contrato legal por defecto de Atlas | `GET /b2b/onboarding/legal-contract-template` |
| El ERP pacta contrato, comisión y checklist | Ver las versiones de contrato del comercio | `GET /b2b/onboarding/cases/:onboardingCaseId/contract-options` |
| El ERP pacta contrato, comisión y checklist | Pactar la versión de contrato del alta | `PATCH /b2b/onboarding/cases/:onboardingCaseId/contract` |
| El ERP pacta contrato, comisión y checklist | Pactar la comisión por venta del caso | `POST /b2b/onboarding/cases/:onboardingCaseId/mdr-rules` |
| El ERP pacta contrato, comisión y checklist | Pedir permiso para subir la evidencia | `POST /b2b/onboarding/cases/:onboardingCaseId/checklist/:checklistItemId/evidence/upload-url` |
| El ERP pacta contrato, comisión y checklist | Adjuntar la evidencia del requisito | `POST /b2b/onboarding/cases/:onboardingCaseId/checklist/:checklistItemId/evidence` |
| El ERP pacta contrato, comisión y checklist | Completar o dispensar un requisito | `PATCH /b2b/onboarding/cases/:onboardingCaseId/checklist` |
| El ERP activa el comercio | Activar el comercio | `PATCH /b2b/onboarding/cases/:onboardingCaseId/activate` |

## P-17 · QR de cobro, sucursales, terminales POS y expediente del comercio

`merchant_qr_pos_and_file` · prioridad **P0** · dueño `OPERATIONS_MANAGER` · ficha: [AtlasBackend/docs/processes/merchant_qr_pos_and_file.md](https://github.com/PabloArauzCaballero/AtlasBackend/blob/dev/docs/processes/merchant_qr_pos_and_file.md)

| Etapa | Paso | Operación |
|---|---|---|
| El comercio registra sus sucursales y cajas | Registrar una sucursal (pasarela del ERP) | `POST /partner-onboarding/:partnerId/branches` |
| El comercio registra sus sucursales y cajas | Editar o enlazar una sucursal (pasarela del ERP) | `PATCH /partner-onboarding/:partnerId/branches/:branchId` |
| El comercio registra sus sucursales y cajas | Ver las sucursales (pasarela del ERP) | `GET /partner-onboarding/:partnerId/branches` |
| El comercio registra sus sucursales y cajas | Registrar una caja (pasarela del ERP) | `POST /partner-onboarding/:partnerId/branches/:branchId/pos-terminals` |
| El comercio registra sus sucursales y cajas | Ver las cajas (pasarela del ERP) | `GET /partner-onboarding/:partnerId/pos-terminals` |
| El comercio registra sus sucursales y cajas | Suspender o reactivar una caja (pasarela del ERP) | `PATCH /partner-onboarding/:partnerId/pos-terminals/:terminalId` |
| El comercio sube su QR de cobro | Pedir permiso de subida (pasarela del ERP) | `POST /partner-onboarding/:partnerId/qr-codes/upload-url` |
| El comercio sube su QR de cobro | Registrar el QR subido (pasarela del ERP) | `POST /partner-onboarding/:partnerId/qr-codes` |
| El comercio sube su QR de cobro | Ver mis QR (pasarela del ERP) | `GET /partner-onboarding/:partnerId/qr-codes` |
| El comercio sube su QR de cobro | Ver la imagen del QR (pasarela del ERP) | `GET /partner-onboarding/:partnerId/qr-codes/:qrId/content` |
| El ERP mantiene sus propias sucursales del comercio | Listar las sucursales del ERP | `GET /b2b/onboarding/branches` |
| El ERP mantiene sus propias sucursales del comercio | Crear una sucursal en el ERP | `POST /b2b/onboarding/branches` |
| El ERP mantiene sus propias sucursales del comercio | Cambiar el estado de una sucursal del ERP | `PATCH /b2b/onboarding/branches/:branchId/status` |

## P-18 · Usuarios del comercio: provisión por cola, acceso y recuperación de contraseña

`merchant_users_and_access` · prioridad **P1** · dueño `OPERATIONS_MANAGER` · ficha: [AtlasBackend/docs/processes/merchant_users_and_access.md](https://github.com/PabloArauzCaballero/AtlasBackend/blob/dev/docs/processes/merchant_users_and_access.md)

| Etapa | Paso | Operación |
|---|---|---|
| El ERP pide el acceso | Registrar a la persona del comercio | `POST /b2b/onboarding/merchant-users` |
| El ERP acusa el resultado | Acusar las credenciales del caso | `POST /b2b/onboarding/cases/:onboardingCaseId/identity/reconcile` |
| El ERP acusa el resultado | Reconciliar una sola persona | `PATCH /b2b/onboarding/merchant-users/:merchantUserId/identity` |
| La persona del comercio inicia sesión | Iniciar sesión (pasarela del ERP) | `POST /auth/merchant/login` |
| La persona del comercio inicia sesión | Confirmar quién entró (pasarela del ERP) | `GET /auth/merchant/me` |
| La persona del comercio inicia sesión | Renovar la sesión (pasarela del ERP) | `POST /auth/merchant/refresh` |
| La persona del comercio inicia sesión | Cerrar sesión (pasarela del ERP) | `POST /auth/merchant/logout` |
| El comercio recupera su contraseña | Pedir el código (pasarela del ERP) | `POST /auth/merchant/password-reset/request` |
| El comercio recupera su contraseña | Fijar la contraseña nueva (pasarela del ERP) | `POST /auth/merchant/password-reset/confirm` |

## P-19 · CRM del comercio: alta comercial, calificación, propuesta, pricing y contratación

`merchant_contract_and_pricing` · prioridad **P1** · dueño `ERP:COMMERCIAL_MANAGER` · ficha: [AtlasBackend/docs/processes/merchant_contract_and_pricing.md](https://github.com/PabloArauzCaballero/AtlasBackend/blob/dev/docs/processes/merchant_contract_and_pricing.md)

| Etapa | Paso | Operación |
|---|---|---|
| Alta comercial de la cuenta | Crear la cuenta B2B | `POST /b2b/accounts` |
| Alta comercial de la cuenta | Registrar el contacto principal | `POST /b2b/accounts/:accountId/contacts` |
| Alta comercial de la cuenta | Ver las cuentas | `GET /b2b/accounts` |
| Calificación y oportunidad | Calificar la cuenta | `POST /b2b/accounts/:accountId/qualify` |
| Calificación y oportunidad | Abrir la oportunidad | `POST /b2b/opportunities` |
| Calificación y oportunidad | Avanzar la oportunidad | `PATCH /b2b/opportunities/:id/stage` |
| Propuesta y pricing | Crear la propuesta | `POST /b2b/proposals` |
| Propuesta y pricing | Editar la propuesta | `PATCH /b2b/proposals/:proposalId` |
| Propuesta y pricing | Enviar la propuesta | `PATCH /b2b/proposals/:proposalId/send` |
| Propuesta y pricing | Registrar que el comercio acepta | `PATCH /b2b/proposals/:proposalId/accept` |
| Propuesta y pricing | Registrar que el comercio rechaza | `PATCH /b2b/proposals/:proposalId/reject` |
| Aprobación de la comisión bajo el mínimo | Ver las aprobaciones pendientes | `GET /b2b/proposals/approvals` |
| Aprobación de la comisión bajo el mínimo | Aprobar o rechazar la excepción de comisión | `PATCH /b2b/proposals/approvals/:id/decision` |
| Contratación | Crear el contrato desde la propuesta | `POST /b2b/contracts/from-proposal` |
| Contratación | Firmar y activar el contrato | `PATCH /b2b/contracts/:contractId/sign-and-activate` |
| Contratación | Ver los contratos | `GET /b2b/contracts` |
| Reglas de comisión por venta | Ver las reglas de comisión | `GET /b2b/contracts/mdr-rules` |
| Reglas de comisión por venta | Crear una regla de comisión | `POST /b2b/contracts/mdr-rules` |
| Reglas de comisión por venta | Cambiar una regla de comisión | `PATCH /b2b/contracts/mdr-rules/:ruleId` |
| Atlas recibe la comisión pactada | Entregar el evento a Atlas | job `worker-outbox` |
| El contrato llega al alta del comercio | Leer el contrato legal por defecto | `GET /b2b/onboarding/legal-contract-template` |
| El contrato llega al alta del comercio | Pactar la versión contractual del alta | `PATCH /b2b/onboarding/cases/:onboardingCaseId/contract` |

## P-20 · Venta BNPL, comisión MDR, consumo y facturación del comercio (incl. SIAT)

`bnpl_sale_mdr_billing` · prioridad **P1** · dueño `ERP:FINANCE` · ficha: [AtlasBackend/docs/processes/bnpl_sale_mdr_billing.md](https://github.com/PabloArauzCaballero/AtlasBackend/blob/dev/docs/processes/bnpl_sale_mdr_billing.md)

| Etapa | Paso | Operación |
|---|---|---|
| Core informa la banda de riesgo del cliente | Guardar la banda de riesgo del cliente | `POST /integration/core/events` |
| Se registra la venta a plazos | Registrar la compra y su comisión | `POST /b2b/bnpl/purchases` |
| El comercio ve su consumo y facturación | Ver los cobros (pasarela del ERP) | `GET /merchant-credit/:partnerId/portfolio` |
| El comercio ve su consumo y facturación | Ver las comisiones que debe | `GET /portal/commissions` |
| El comercio ve su consumo y facturación | Ver cargos y facturas | `GET /portal/billing` |
| El comercio ve su consumo y facturación | Descargar una factura | `GET /portal/billing/invoices/:id` |
| Finanzas emite la factura de comisión | Ver las cuentas por cobrar | `GET /b2b/receivables` |
| Finanzas emite la factura de comisión | Emitir la factura | `POST /b2b/billing/invoices` |
| Finanzas emite la factura de comisión | Ver las facturas emitidas | `GET /b2b/billing/invoices` |
| Finanzas emite la factura de comisión | Descargar la factura como documento | `GET /b2b/billing/invoices/:id` |
| Finanzas registra el pago y contabiliza | Registrar el pago del comercio | `POST /b2b/billing/merchant-payments` |
| Finanzas registra el pago y contabiliza | Contabilizar la factura | `PATCH /b2b/billing/invoices/:id/post-to-gl` |

## P-21 · Cobertura de CxC del comercio, barrido de mora, recuperación y conciliación

`coverage_and_recovery` · prioridad **P1** · dueño `ERP:FINANCE` · ficha: [AtlasBackend/docs/processes/coverage_and_recovery.md](https://github.com/PabloArauzCaballero/AtlasBackend/blob/dev/docs/processes/coverage_and_recovery.md)

| Etapa | Paso | Operación |
|---|---|---|
| El barrido marca la mora | Recibir los avisos y confirmaciones de pago de Core | `POST /integration/core/events` |
| El barrido marca la mora | Barrer las cuotas vencidas | job `b2b.overdue-sweep` |
| El barrido marca la mora | Lanzar el barrido a mano | `POST /b2b/coverage/installments/sweep-overdue` |
| Finanzas resuelve lo ambiguo | Ver la cola de revisión | `GET /b2b/coverage/review-queue` |
| Finanzas resuelve lo ambiguo | Resolver un elemento de revisión | `POST /b2b/coverage/review-queue/:reviewItemId/resolve` |
| Finanzas programa la cobertura | Ver las cuotas | `GET /b2b/coverage/installments` |
| Finanzas programa la cobertura | Programar la cobertura de la cuota | `POST /b2b/coverage/payables` |
| Finanzas programa la cobertura | Ver las coberturas | `GET /b2b/coverage/payables` |
| Finanzas programa la cobertura | Cancelar la cobertura | `PATCH /b2b/coverage/payables/:payableId/cancel` |
| Liquidación con doble control | Registrar la liquidación al comercio | `PATCH /b2b/coverage/payables/:payableId/paid` |
| Liquidación con doble control | Aprobar la liquidación | `PATCH /b2b/coverage/payables/:payableId/settlement/approve` |
| Liquidación con doble control | Rechazar la liquidación | `PATCH /b2b/coverage/payables/:payableId/settlement/reject` |
| Core se entera de la cobertura y la recuperación | Entregar los eventos de cobertura | job `worker-outbox` |
| Cobranza registra la recuperación | Ver las recuperaciones | `GET /b2b/coverage/recoveries` |
| Cobranza registra la recuperación | Aplicar un cobro de recuperación | `PATCH /b2b/coverage/recoveries/:recoveryId/apply-payment` |
| Cobranza registra la recuperación | Ver los cobros de una recuperación | `GET /b2b/coverage/recoveries/:recoveryId/movements` |
| Cobranza registra la recuperación | Revertir un cobro equivocado | `POST /b2b/coverage/recoveries/:recoveryId/movements/:movementId/reverse` |
| Conciliación del período | Ejecutar la conciliación | `POST /b2b/reconciliation/runs` |

## P-22 · Soporte al comercio desde el ERP (pasarela) hacia la mesa de Atlas

`merchant_support` · prioridad **P1** · dueño `OPERATIONS_MANAGER` · ficha: [AtlasBackend/docs/processes/merchant_support.md](https://github.com/PabloArauzCaballero/AtlasBackend/blob/dev/docs/processes/merchant_support.md)

| Etapa | Paso | Operación |
|---|---|---|
| El comercio busca ayuda escrita | Ver las preguntas frecuentes (pasarela del ERP) | `GET /merchant/support/faq` |
| El comercio busca ayuda escrita | Ver los motivos (pasarela del ERP) | `GET /merchant/support/categories` |
| El comercio busca ayuda escrita | Buscar en la ayuda (pasarela del ERP) | `GET /merchant/support/knowledge/search` |
| El comercio abre su caso o su chat | Abrir un caso (pasarela del ERP) | `POST /merchant/support/cases` |
| El comercio abre su caso o su chat | Abrir el chat (pasarela del ERP) | `POST /support/channels` |
| El comercio abre su caso o su chat | Escribir en el chat (pasarela del ERP) | `POST /support/channels/:channelId/messages` |
| El comercio sigue, cierra y valora | Ver mis casos (pasarela del ERP) | `GET /merchant/support/partners/:partnerProfileId/cases` |
| El comercio sigue, cierra y valora | Ver un caso (pasarela del ERP) | `GET /merchant/support/cases/:caseId` |
| El comercio sigue, cierra y valora | Pedir el cierre (pasarela del ERP) | `POST /merchant/support/cases/:caseId/close-request` |
| El comercio sigue, cierra y valora | Valorar la atención (pasarela del ERP) | `POST /merchant/support/cases/:caseId/feedback` |

## P-23 · Ciclo contable: borrador → publicar → reversar, factura AR, recibo y cierre de período

`accounting_documents_cycle` · prioridad **P0** · dueño `ERP:CFO` · ficha: [AtlasBackend/docs/processes/accounting_documents_cycle.md](https://github.com/PabloArauzCaballero/AtlasBackend/blob/dev/docs/processes/accounting_documents_cycle.md)

| Etapa | Paso | Operación |
|---|---|---|
| Crear el borrador | Crear el documento en borrador | `POST /accounting/documents` |
| Crear el borrador | Crear borradores en lote | `POST /accounting/documents/bulk` |
| Crear el borrador | Listar documentos contables | `GET /accounting/documents` |
| Crear el borrador | Leer un documento | `GET /accounting/documents/:id` |
| Aprobar o rechazar el borrador | Aprobar el borrador | `PATCH /accounting/documents/:id/approve` |
| Aprobar o rechazar el borrador | Rechazar el borrador | `PATCH /accounting/documents/:id/reject` |
| Publicar el documento | Publicar | `PATCH /accounting/documents/:id/post` |
| Reversar un documento publicado | Reversar | `POST /accounting/documents/:id/reverse` |
| Emitir la factura AR | Emitir factura AR | `POST /accounting/billing/ar-invoices` |
| Emitir la factura AR | Listar facturas AR | `GET /accounting/billing/ar-invoices` |
| Emitir la factura AR | Leer una factura AR | `GET /accounting/billing/ar-invoices/:id` |
| Registrar el recibo | Registrar recibo | `POST /accounting/receipts` |
| Registrar el recibo | Listar recibos | `GET /accounting/receipts` |
| Cerrar el período | Ver los períodos | `GET /accounting/financial-structure/periods` |
| Cerrar el período | Cerrar período | `POST /accounting/closings/periods/close` |
| Cerrar el período | Reabrir período | `PATCH /accounting/closings/periods/reopen` |
| Entregar los eventos contables | Trabajador del buzón contable | job `worker:outbox (src/workers/outbox/outbox.worker.ts)` |
| Vigilar y reenviar eventos muertos | Estado del buzón | `GET /accounting/outbox/status` |
| Vigilar y reenviar eventos muertos | Eventos muertos | `GET /accounting/outbox/events/dead` |
| Vigilar y reenviar eventos muertos | Reenviar un evento | `POST /accounting/outbox/events/:eventKey/replay` |

## P-25 · Publicidad externa (ATLAS Ads): alta de anunciante, perfil fiscal, estado y moderación

`ads_advertisers` · prioridad **P2** · dueño `ERP:ADS_ADMIN_MANAGER` · ficha: [AtlasBackend/docs/processes/ads_advertisers.md](https://github.com/PabloArauzCaballero/AtlasBackend/blob/dev/docs/processes/ads_advertisers.md)

| Etapa | Paso | Operación |
|---|---|---|
| Alta del anunciante | Dar de alta el anunciante | `POST /admin/ads/advertisers` |
| Alta del anunciante | Alta de anunciantes en lote | `POST /admin/ads/advertisers/bulk` |
| Perfil fiscal del anunciante | Crear el perfil fiscal | `POST /admin/ads/advertisers/:advertiserId/billing-profiles` |
| Estado del anunciante | Cambiar el estado del anunciante | `PATCH /admin/ads/advertisers/:advertiserId/status` |
| Armar la campaña | Crear la campaña | `POST /admin/ads/campaigns` |
| Armar la campaña | Crear un conjunto de anuncios | `POST /admin/ads/campaigns/:campaignId/ad-sets` |
| Armar la campaña | Crear una creatividad | `POST /admin/ads/creatives` |
| Armar la campaña | Crear el anuncio | `POST /admin/ads/ad-sets/:adSetId/ads` |
| Enviar a moderación | Enviar la campaña a revisión | `POST /admin/ads/campaigns/:campaignId/submit` |
| Moderar | Ver la cola de moderación | `GET /admin/ads/moderation/queue` |
| Moderar | Decidir la revisión | `POST /admin/ads/moderation/:reviewId/decision` |
| Activar, pausar, terminar o archivar | Cambiar el estado de la campaña | `PATCH /admin/ads/campaigns/:campaignId/status` |
| Entregar el anuncio y contar eventos | Elegir el anuncio a mostrar | `POST /ads/delivery/select` |
| Entregar el anuncio y contar eventos | Registrar un evento | `POST /ads/events` |
| Corregir si un evento es facturable | Cambiar el estado facturable | `PATCH /admin/ads/events/:eventId/billable-status` |
| Cerrar la facturación y cobrar | Cerrar el período de facturación | `POST /admin/ads/billing/period-close` |
| Cerrar la facturación y cobrar | Registrar un pago | `POST /admin/ads/invoices/:invoiceId/payments` |

## P-30 · Catálogo de sistemas: descubrimiento, introspección, narrativas, revisión humana y federación

`systems_catalog_governance` · prioridad **P2** · dueño `DATA_GOVERNANCE_MANAGER` · ficha: [AtlasBackend/docs/processes/systems_catalog_governance.md](https://github.com/PabloArauzCaballero/AtlasBackend/blob/dev/docs/processes/systems_catalog_governance.md)

| Etapa | Paso | Operación |
|---|---|---|
| Federación de bloques | Manifiesto de catálogo del ERP | `GET /platform/catalog-manifest` |

## P-38 · Despliegue y release: Actions → Coolify (dev), rama test (Contabo), migraciones al desplegar, verificación desde la red de Pablo

`deploy_and_release` · prioridad **P2** · dueño `SYSTEMS_ADMIN` · ficha: [AtlasBackend/docs/processes/deploy_and_release.md](https://github.com/PabloArauzCaballero/AtlasBackend/blob/dev/docs/processes/deploy_and_release.md)

| Etapa | Paso | Operación |
|---|---|---|
| Smoke del servicio publicado | Salud del ERP | `GET /health` |

