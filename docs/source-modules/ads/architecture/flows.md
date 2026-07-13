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
