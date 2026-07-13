# Auditoría ultra estricta de producción — ATLAS Ads

Fecha de auditoría: 2026-07-08.

## 1. Resultado ejecutivo

La revisión no se trató como una lectura superficial. Se ejecutó una auditoría correctiva sobre arquitectura, contrato UML, seguridad, persistencia, facturación, delivery, idempotencia, RBAC, documentación y verificaciones automáticas.

El módulo queda en estado **apto para revisión técnica exigente e integración en staging**, con correcciones reales aplicadas sobre los puntos que podían romper producción o generar deuda técnica seria.

## 2. Hallazgos críticos corregidos

| Severidad | Hallazgo                                                                         | Riesgo a largo plazo                                            | Estado    |
| --------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------- |
| Crítica   | Migración SQL inválida por cierre extra en `ad_delivery_decisions`               | El despliegue fallaba al correr migraciones desde cero          | Corregido |
| Crítica   | Cierre de facturación agrupaba por campaña y podía crear facturas inconsistentes | Duplicidad contable, facturas parciales y disputas de cobro     | Corregido |
| Alta      | No existía endpoint para crear perfil fiscal aunque la facturación lo requiere   | Bloqueo operativo del alta de anunciantes facturables           | Corregido |
| Alta      | Tracking de eventos no era idempotente                                           | Reintentos podían duplicar cargos y distorsionar métricas       | Corregido |
| Alta      | Incremento de gasto de campaña no era atómico                                    | Concurrencia podía superar presupuesto contratado               | Corregido |
| Alta      | Cambiar un evento de facturable/no facturable no ajustaba ledger ni presupuesto  | Inconsistencia contable y reportes incorrectos                  | Corregido |
| Alta      | JWT solo validaba firma básica                                                   | Tokens de contexto incorrecto podían ser aceptados              | Corregido |
| Alta      | Errores Sequelize podían filtrarse como 500 genéricos                            | Mala DX, respuestas inconsistentes y posible exposición técnica | Corregido |
| Media     | Fechas de reportes/cierres no rechazaban rangos invertidos                       | Consultas silenciosamente incorrectas                           | Corregido |
| Media     | Smoke test no guardaba resultado JSON persistente                                | Menor trazabilidad de QA                                        | Corregido |
| Media     | Pino no redaccionaba suficientes campos sensibles                                | Riesgo de fuga accidental en logs                               | Corregido |

## 3. Correcciones técnicas aplicadas

### 3.1 Base de datos y migraciones

- Se corrigió la sintaxis SQL de la migración principal.
- Se agregaron índices únicos parciales para proteger idempotencia y facturación:
  - `uq_ad_event_tracking_idempotency`.
  - `uq_ad_spend_ledger_event_charge`.
  - `uq_ad_invoice_open_period`.
- Se mantuvo la política de no usar `sequelize.sync({ force: true })` ni `alter` en producción.

### 3.2 Facturación

- El cierre de periodo ahora agrupa por `advertiser + currency` y crea líneas por campaña.
- El cierre es idempotente por anunciante, moneda y rango de periodo.
- El pago rechaza facturas `VOID`, `PAID`, moneda incorrecta y sobrepago.
- La facturación sigue naciendo desde `ad_spend_ledger`, no desde `ad_events`.

### 3.3 Delivery y tracking

- El delivery ahora respeta `frequencyCap` por hash corporativo y ventana horaria.
- El tracking usa idempotencia por `deliveryDecisionId + eventType + requestId`.
- Los cargos facturables reservan presupuesto de forma atómica.
- Si un evento se marca como no facturable, se genera reverso `CREDIT` y se libera presupuesto.
- Si un evento vuelve a billable, se reserva presupuesto y se crea ajuste controlado.

### 3.4 Seguridad

- JWT Bearer exige formato estricto `Bearer <jwt>`.
- El token debe validar firma, expiración, issuer, audience y `tokenType` permitido.
- Se añadieron variables `JWT_INTERNAL_ISSUER` y `JWT_INTERNAL_AUDIENCE`.
- `CurrentUser` ya no lanza `Error` crudo; responde `401` controlado.
- Request IDs entrantes se aceptan solo si tienen formato seguro.
- Pino redacciona token, authorization, cookies, password y campos comunes de tokens.

### 3.5 Validación y errores

- Zod valida rangos de fechas en auditoría, dashboard y cierre de facturación.
- Zod valida el nuevo contrato de perfil fiscal.
- El filtro global normaliza errores Sequelize:
  - unique constraint → `409 CONFLICT`.
  - foreign key constraint → `409 CONFLICT`.
  - Sequelize validation → `400 VALIDATION_ERROR`.
  - database error → `500 DATABASE_ERROR`.

### 3.6 Documentación y QA

- Se actualizó `docs/endpoints/endpoints.md`.
- Se actualizó `docs/endpoints/openapi.yaml`.
- Se actualizó `docs/postman/collection.json`.
- Se agregó este informe en `docs/audit/production-audit.md`.
- Se actualizó el smoke test para guardar resultado en `scripts/smoke/admin-ads.smoke.result.json`.

## 4. Verificaciones ejecutadas

| Verificación              | Estado esperado                                                |
| ------------------------- | -------------------------------------------------------------- |
| `npm run type-check`      | Debe pasar sin errores                                         |
| `npm run build`           | Debe compilar NestJS                                           |
| `npm test -- --runInBand` | Debe pasar suite Jest                                          |
| `npm run lint`            | Debe pasar ESLint                                              |
| `npm audit`               | Sin críticas/altas; quedan observaciones moderadas transitivas |

Los resultados finales están documentados también en `docs/progress/progress-report.md`.

## 5. Riesgos residuales reales

| Riesgo residual                                                                                  | Impacto                                                                      | Recomendación                                                                                         |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| No se ejecutó smoke e2e contra PostgreSQL real dentro del sandbox                                | No confirma migración/queries en una instancia real durante esta auditoría   | Ejecutar `yarn db:migrate && yarn db:seed && yarn smoke:admin` en staging con PostgreSQL              |
| `npm audit` conserva vulnerabilidades moderadas transitivas asociadas al árbol de Sequelize/uuid | Riesgo moderado de supply chain; no hay altas ni críticas tras actualización | Resolver en fase de hardening de dependencias o migración controlada cuando exista versión compatible |
| Emisión fiscal/SIN no está integrada                                                             | Factura actual es operativa, no comprobante fiscal real                      | Integrar proveedor fiscal/contable antes de facturación legal productiva                              |
| JWT depende del issuer ATLAS real                                                                | Si el sistema central emite tokens con otro payload, RBAC fallará            | Alinear `sub`, `roles`, `tokenType`, issuer y audience con Auth ATLAS                                 |
| Alto volumen de eventos puede exigir particionamiento                                            | Crecimiento de `ad_events` afectará performance                              | Particionar por mes y archivar eventos fríos antes de escala alta                                     |

## 6. Dictamen

El módulo quedó **mucho más sólido que la primera entrega** y corrige fallas que sí podían romper despliegue, cobros, auditoría e idempotencia. No se debe vender como producción definitiva hasta ejecutar migraciones y smoke e2e en PostgreSQL real, pero el código ahora está en condiciones razonables para pasar a staging con una revisión DevOps/DBA.
