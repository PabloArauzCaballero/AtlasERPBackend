# Flujos del backend integrado ATLAS

## Flujo HTTP común

1. La request entra al proceso NestJS integrado.
2. `RequestContextMiddleware` asegura `requestId`.
3. Helmet, CORS, compression, cookie parser y límites de body se aplican globalmente.
4. `JwtAuthGuard` valida JWT Bearer salvo endpoints `@Public()`.
5. `RolesGuard` valida permisos por `roleCode`, `role` o `roles`.
6. El controller del módulo recibe entrada validada con `ZodValidationPipe`.
7. El service ejecuta reglas de negocio y transacciones Sequelize cuando corresponde.
8. `ResponseInterceptor` normaliza respuestas exitosas.
9. `HttpExceptionFilter` normaliza errores HTTP y Sequelize.

## Flujo de migración recomendado

1. Ejecutar `npm run db:migrate:crm`.
2. Ejecutar `npm run db:migrate:accounting`.
3. Ejecutar `npm run db:migrate:ads`.
4. Ejecutar `npm run db:seed` solo después de validar que las migraciones terminaron correctamente.

## Flujo de worker outbox contable

El worker contable permanece separado del proceso HTTP y se ejecuta con `npm run dev:worker:outbox` o `npm run worker:outbox` después del build.

## Flujos fuente: CRM / Ventas B2B

# Flujos principales

## Alta comercial

1. Ejecutivo crea cuenta B2B.
2. Sistema valida duplicados por NIT o nombre comercial.
3. Crea `b2b_account` en `LEAD`.
4. Crea contacto principal.
5. Registra auditoría.

## Calificación

1. Ejecutivo califica la cuenta.
2. Si tiene fit, pasa a `QUALIFIED`.
3. Opcionalmente crea oportunidad en `DISCOVERY`.
4. Si no tiene fit, pasa a `DISQUALIFIED` y conserva motivo.

## Propuesta y pricing

1. Ejecutivo crea propuesta con líneas.
2. Si MDR está debajo del mínimo configurado, se crea `approval_request`.
3. La propuesta no puede enviarse mientras haya aprobación pendiente.
4. Si se aprueba, vuelve a `DRAFT` y puede enviarse.
5. Si el comercio acepta, la propuesta pasa a `ACCEPTED` y la oportunidad a `CONTRACTING`.

## Contratación

1. Legal crea contrato desde propuesta aceptada.
2. Se crea `b2b_contract` y `contract_version` inicial.
3. Las líneas de propuesta se congelan como `commercial_terms`.
4. Al firmar, contrato y versión pasan a activos.
5. La oportunidad se cierra como `CLOSED_WON`.

## Onboarding

1. Operaciones crea caso con checklist.
2. Registra sucursales y usuarios corporativos.
3. Completa checklist.
4. Para activar, el sistema exige contrato activo y checklist completo.
5. Cuenta pasa a `CUSTOMER`; sucursales pendientes pasan a `ACTIVE` y `can_originate_bnpl=true`.

## Venta BNPL y MDR

1. Comercio inicia compra BNPL.
2. Sistema valida cuenta `CUSTOMER`, sucursal activa y contrato vigente.
3. Valida pago inicial 60% y financiamiento 40%.
4. Crea compra y cuotas.
5. Guarda `contract_version_id` vigente.
6. Calcula MDR desde `mdr_rules` o `commercial_terms`.
7. Crea `merchant_receivable` MDR contra comercio.

## Facturación y cobro B2B

1. Finanzas selecciona receivables abiertos.
2. Se crea invoice y líneas.
3. Cargos quedan asociados a la factura.
4. Comercio paga.
5. Pago se aplica por allocations explícitas.
6. Sistema actualiza saldos y estados.

## Cobertura y recuperación

1. Una cuota queda impaga.
2. Se crea CxP `merchant_payable` por esa cuota específica.
3. ATLAS paga al comercio.
4. Recién al marcar CxP como `PAID` nace `consumer_recovery_receivable`.
5. Recuperaciones parciales actualizan saldo y estado.

## Conciliación

1. Finanzas/Operaciones ejecuta `reconciliation_run`.
2. Sistema detecta compras sin MDR, CxC vencidas, cuotas sin CxP y CxP pagadas sin recuperación.
3. Se crean `reconciliation_items`.
4. El run queda `COMPLETED` u `OPEN_ITEMS`.

## Flujo de pago inicial consumidor → comercio

Al registrar una compra BNPL, el sistema valida que el pago inicial sea 60% del valor de compra y registra ese pago en `consumer_payments_to_merchant`. Este registro no reemplaza la CxC B2B por MDR ni la CxP ATLAS→comercio por cobertura; solo preserva trazabilidad operativa del dinero que el consumidor pagó directamente al comercio.

## Flujos fuente: Contabilidad

# Flujos del módulo contable

## 1. Crear documento contable draft

1. Controller recibe body validado por Zod.
2. Service valida que el período esté abierto.
3. `DoubleEntryValidator` exige:
   - cada línea tiene débito o crédito, nunca ambos.
   - total débito = total crédito.
4. Se crea `accounting_document`.
5. Se crea `journal_entry`.
6. Se crean `journal_entry_line`.
7. Se registra auditoría.
8. Se crea evento en `event_outbox`.

## 2. Publicar documento

1. Se busca el documento.
2. Se exige estado `DRAFT`.
3. Se valida período abierto.
4. Se recalcula cuadratura.
5. Se genera hash SHA-256 del asiento.
6. Se marca documento `POSTED`.
7. Se marca journal `POSTED`.
8. Se registra auditoría y outbox.

## 3. Reversar documento

1. Se exige documento original `POSTED`.
2. Se leen sus líneas.
3. Se crea un nuevo documento de reverso.
4. Se intercambian débito y crédito.
5. Se publica el documento de reverso.
6. No se edita el asiento original.

## 4. Emitir factura AR

1. Se crea `ar_invoice`.
2. Se crea `ar_invoice_line`.
3. Opcionalmente se crea `electronic_tax_document`.
4. Se genera asiento automático:
   - Dr CxC por gross amount.
   - Cr ingreso por net amount.
   - Cr IVA débito si aplica.
5. Se publica el asiento en la misma transacción.

## 5. Registrar recibo

1. Se crea `receipt`.
2. Se crean `receipt_allocation`.
3. Se genera asiento automático:
   - Dr Banco.
   - Cr CxC.
4. Se publica el asiento en la misma transacción.

## 6. Cierre de período

1. CFO/Admin solicita cierre.
2. Se valida que no existan documentos `DRAFT`.
3. Se crea `close_run`.
4. Se marca el período como cerrado.
5. Se emite outbox `accounting.period.closed`.

## 7. Worker pendiente

El diseño deja `event_outbox` listo. La fase siguiente debe implementar un worker persistente separado del API, con apagado controlado, concurrencia, reintentos e idempotencia.

## Flujo endurecido de posting contable

1. El controller recibe la solicitud protegida por JWT y roles.
2. `ZodValidationPipe` valida body, params o query.
3. El service abre transacción Sequelize.
4. `DoubleEntryValidator` verifica que cada línea tenga débito o crédito y que el asiento cuadre.
5. `SapPostingValidationService` valida período, ledger, entidad legal, cuentas y dimensiones.
6. Se crea `accounting_document` en DRAFT.
7. Se crea `journal_entry` en DRAFT.
8. Se insertan `journal_entry_line`.
9. Se registra `document_audit_log`.
10. Se registra evento en `event_outbox`.
11. Al publicar, se recalcula balance, se genera hash SHA-256 y se actualiza estado a POSTED.
12. Desde ese momento, triggers de base de datos bloquean edición directa.

## Flujo endurecido de factura AR

1. Se valida BP con rol activo `CUSTOMER`, `MERCHANT` o `INTERCOMPANY`.
2. Si existe contrato, se valida entidad legal, contraparte y estado contractual.
3. Si hay impuesto, se exige cuenta fiscal pasiva y tax code.
4. Si el documento fiscal está aceptado por SIAT, se exige CUF, CUFD, hash XML y fecha de emisión.
5. Se crea `ar_invoice`.
6. Se crea `ar_invoice_line`.
7. Se crea opcionalmente `electronic_tax_document`.
8. Se genera asiento AR automático contra CxC, ingreso e impuesto.

## Flujo endurecido de recibo

1. Se valida BP con rol activo compatible.
2. Se valida que la suma de asignaciones sea igual al monto del recibo.
3. Se valida que cada factura AR exista, pertenezca al pagador y tenga saldo abierto suficiente.
4. Se crea `receipt`.
5. Se crean `receipt_allocation`.
6. Se actualiza estado de factura AR a `PAID` o `PARTIALLY_PAID`.
7. Se genera asiento automático banco contra CxC.

## Flujo endurecido de cierre

1. CFO o admin solicita cierre.
2. Se valida que el período exista y esté abierto.
3. `ClosingControlService` calcula controles.
4. Si existen bloqueos, se rechaza con `PERIOD_CLOSE_CONTROLS_FAILED`.
5. Si no hay bloqueos, se crea `close_run` con `control_report_json`.
6. Se marca el período como cerrado.
7. Se emite evento outbox `accounting.period.closed`.

## Flujo endurecido de reverso contable

1. El controller valida `id` y body con Zod.
2. El service abre una transacción.
3. El documento original se bloquea con `FOR UPDATE`.
4. Se valida alcance por entidad legal.
5. Se verifica que el documento original esté `POSTED`.
6. Se busca reverso activo; si existe, se rechaza para evitar doble reversión.
7. Se crea documento reverso en `DRAFT` con débitos y créditos invertidos.
8. Se publica el reverso, calculando hash SHA-256.
9. El documento original queda `REVERSED` y apunta a `reversed_by_id`.
10. Se registra auditoría y evento outbox.

## Flujo endurecido de recibo AR

1. Se valida alcance por entidad legal.
2. Se valida rol activo del pagador.
3. Se agrupan asignaciones por factura.
4. Cada factura AR se bloquea con `FOR UPDATE`.
5. Se calcula saldo abierto dentro de la transacción.
6. Se rechaza la sobreasignación.
7. Se crea recibo, asignaciones y asiento.
8. Se actualiza estado de factura a `PARTIALLY_PAID` o `PAID`.

## Worker outbox persistente

El worker `src/workers/outbox/outbox.worker.ts` corre como proceso separado del API HTTP.

```bash
npm run worker:outbox
```

Ciclo:

1. conecta a PostgreSQL;
2. lee eventos con `published_at IS NULL`;
3. usa `FOR UPDATE SKIP LOCKED`;
4. publica el evento;
5. marca `published_at`;
6. espera si no hay trabajo;
7. maneja `SIGINT`/`SIGTERM`.

## Flujo de smoke test con resultado JSON

1. `scripts/smoke/accounting.smoke.ts` arma un JWT temporal para endpoints protegidos.
2. Ejecuta `/health`, `/ready` y una creación mínima de entidad legal.
3. Cada paso registra resultado con Pino.
4. El reporte completo se guarda siempre en `scripts/smoke/accounting-smoke-result.json`.
5. Si algún paso falla, el script deja `process.exitCode = 1` sin perder el JSON de diagnóstico.

Este comportamiento permite adjuntar evidencia automática en CI/CD aunque el smoke falle.

## Flujos fuente: Publicidad externa

# Flujos — ATLAS Ads

## 1. Dashboard administrativo

1. Admin llama `GET /api/v1/admin/ads/dashboard`.
2. JWT/RBAC valida rol de lectura.
3. Zod valida filtros y rango de fechas.
4. `ReportingRepository` consulta agregados.
5. Service calcula tasa de eventos inválidos y alertas.
6. Interceptor normaliza respuesta con `success`, `data` y `requestId`.

## 2. Alta de anunciante

1. `ADS_ADMIN_MANAGER` llama `POST /api/v1/admin/ads/advertisers`.
2. Zod valida datos legales y fiscales mínimos.
3. Service abre transacción.
4. Repository valida duplicado por país + NIT/tax ID dentro de la misma transacción.
5. Crea `ad_advertiser_accounts` en `PENDING_REVIEW`.
6. Crea auditoría `CREATE_ADVERTISER`.
7. Respuesta incluye `advertiser` y `auditId`.

## 3. Perfil fiscal de anunciante

1. `ADS_FINANCE` o `ADS_ADMIN_MANAGER` llama `POST /api/v1/admin/ads/advertisers/:advertiserId/billing-profiles`.
2. Zod valida razón social, tax ID, país, moneda, email y dirección fiscal.
3. Service abre transacción.
4. Repository confirma que el anunciante existe.
5. Se crea perfil fiscal activo o inactivo según input.
6. Se registra auditoría `CREATE_BILLING_PROFILE`.

Este flujo es obligatorio antes de cerrar facturación real de un anunciante.

## 4. Cambio de estado de anunciante

1. Manager envía estado y motivo obligatorio.
2. Service bloquea transición directa `REJECTED -> ACTIVE`.
3. Repository actualiza estado/riesgo.
4. Audit log registra before/after, motivo y severidad.

## 5. Moderación

1. Moderador consulta `GET /moderation/queue`.
2. Moderador decide con `POST /moderation/:reviewId/decision`.
3. Service exige que la revisión esté en `PENDING_REVIEW`.
4. Actualiza `ad_moderation_reviews`.
5. Propaga decisión a campaña/anuncio/creativo.
6. Registra auditoría.

Regla protegida: no se puede aprobar una revisión ya rechazada sin crear una nueva revisión.

## 6. Delivery de anuncio

1. Servicio interno `ADS_AD_SERVER` llama `POST /api/v1/ads/delivery/select`.
2. Se valida placement activo.
3. Se buscan anuncios elegibles:
   - anunciante `ACTIVE` y no `BLOCKED`;
   - campaña, ad set, ad y creative `ACTIVE`;
   - aprobación `APPROVED`;
   - fechas vigentes;
   - presupuesto no agotado;
   - placement activo;
   - frecuencia permitida para `corporateClientHash`.
4. Se calcula prioridad simplificada por bid x weight.
5. Se registra `ad_delivery_decisions`.
6. Se retorna creative y endpoints de tracking.

## 7. Eventos y ledger

1. Motor interno registra `IMPRESSION`, `CLICK` o `CONVERSION` en `POST /api/v1/ads/events`.
2. Se busca si ya existe evento con la misma combinación `deliveryDecisionId + eventType + requestId`.
3. Si ya existe, se responde el evento existente y no se duplica ledger.
4. Se carga delivery decision.
5. Si la campaña ya no está activa, se rechaza evento facturable.
6. Se calcula costo según modelo:
   - CPM: impresión / 1000.
   - CPC: click.
   - CPA: conversión.
   - FIXED: sin cargo por evento.
7. Si fraude supera umbral, el evento se guarda como no facturable.
8. Si es facturable, se reserva presupuesto con update atómico.
9. Se crea `ad_spend_ledger` con tipo `CHARGE`.

## 8. Corrección de billable status

1. Operaciones llama `PATCH /api/v1/admin/ads/events/:eventId/billable-status`.
2. El cambio exige motivo y genera auditoría de severidad alta.
3. Si pasa de billable a no billable:
   - se crea ledger `CREDIT` negativo;
   - se libera presupuesto de campaña.
4. Si pasa de no billable a billable:
   - se reserva presupuesto de forma atómica;
   - se crea ledger `ADJUSTMENT`.
5. No se permite duplicar ajustes innecesarios cuando el estado no cambia.

## 9. Cierre de facturación

1. Finanzas llama `POST /api/v1/admin/ads/billing/period-close`.
2. Service valida rango de fechas.
3. Repository confirma que el periodo no esté cerrado para el mismo anunciante, moneda y rango.
4. Repository agrupa `ad_spend_ledger` por anunciante, moneda y campaña.
5. Se exige perfil fiscal activo.
6. Se crea una factura `DRAFT` por anunciante/moneda y líneas por campaña.
7. Se audita cada factura creada.

Reglas protegidas:

- Nunca se factura directamente desde `ad_events`.
- No se duplica factura para el mismo anunciante, moneda y periodo.
- No se mezclan monedas en una misma factura.

## 10. Registro de pago

1. Finanzas registra pago en `POST /api/v1/admin/ads/invoices/:invoiceId/payments`.
2. Se rechazan facturas `VOID` o `PAID`.
3. Se rechaza moneda diferente a la factura.
4. Se rechaza sobrepago.
5. Se crea `ad_payments`.
6. Se recalcula total pagado.
7. Factura pasa a `PARTIALLY_PAID` o `PAID`.
8. Se registra auditoría.

## 11. Auditoría

1. Auditor llama `GET /api/v1/admin/ads/audit-logs`.
2. Zod valida filtros y rango de fechas.
3. RBAC exige `ADS_AUDITOR`, `ADS_COMPLIANCE_ADMIN` o `ADS_SUPER_ADMIN`.
4. Repository devuelve logs paginados.

## 12. Smoke test

1. Script `scripts/smoke/admin-ads.smoke.ts` consulta health y endpoints principales.
2. Si no hay token, registra el caso como esperado para endpoints protegidos.
3. El resultado se guarda en `scripts/smoke/admin-ads.smoke.result.json`.

---

## 13. Endurecimiento: no es backend solo CRUD

El backend integrado no queda limitado a CRUDs simples. Existen casos de uso que coordinan varias tablas dentro de transacciones y aplican reglas de negocio antes de persistir:

- B2B `POST /api/v1/b2b/accounts`: crea cuenta, contacto principal y auditoría en una transacción.
- B2B `POST /api/v1/b2b/proposals`: crea propuesta, líneas y aprobaciones cuando corresponde.
- B2B `POST /api/v1/b2b/contracts/from-proposal`: materializa contrato desde propuesta aprobada.
- B2B `POST /api/v1/b2b/bnpl/purchases`: registra compra, cuotas y CxC derivadas.
- Accounting `POST /api/v1/accounting/documents`: crea documento, asiento, líneas, audit log y outbox.
- Accounting `PATCH /api/v1/accounting/documents/:id/post`: valida periodo, doble partida, genera hash y publica asiento.
- Accounting `POST /api/v1/accounting/documents/:id/reverse`: crea reverso, lo publica y actualiza documento original.
- Accounting `POST /api/v1/accounting/receipts`: crea recibo, asignaciones, actualiza facturas y genera documento contable.
- Ads `POST /api/v1/ads/events`: registra evento, reserva presupuesto y crea ledger si corresponde.
- Ads `POST /api/v1/admin/ads/billing/period-close`: agrupa ledger, crea facturas y líneas.

## 14. Business Action Log transversal

Se agregó `atlas_audit.business_action_logs` como bitácora de negocio separada de:

- logs técnicos Pino;
- logs HTTP;
- `b2b_sales.audit_logs`;
- `atlas_accounting.document_audit_log`;
- `ad_audit_log`.

El objetivo es registrar procesos de negocio y batches con:

- módulo;
- proceso de negocio;
- código de acción;
- actor;
- correlación o batch externo;
- agregado afectado;
- tablas impactadas;
- cantidad de registros afectados;
- estado;
- resumen de entrada/salida.

Consulta administrativa: `GET /api/v1/audit/business-actions`.

## 15. Modo BULK / BATCH

Se agregaron endpoints bulk productivos, validados con Zod y ejecutados con transacción:

1. `POST /api/v1/b2b/accounts/bulk`
   - Crea hasta 100 cuentas con contacto principal.
   - Impacta cuentas, contactos, auditoría CRM y business action log.

2. `POST /api/v1/accounting/documents/bulk`
   - Crea hasta 50 documentos contables con asientos y líneas.
   - Mantiene doble partida, validación SAP-like, outbox y business action log.

3. `POST /api/v1/admin/ads/advertisers/bulk`
   - Crea hasta 100 anunciantes externos.
   - Valida duplicidad por país y taxId.

4. `POST /api/v1/ads/events/bulk`
   - Procesa hasta 500 eventos publicitarios.
   - Mantiene idempotencia y ledger atómico por evento facturable.

Los endpoints bulk están diseñados para cargas operativas, importaciones controladas, conciliaciones y eventos de alto volumen sin convertir el sistema en CRUD plano.
