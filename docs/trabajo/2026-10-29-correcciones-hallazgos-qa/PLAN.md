# Plan — Correcciones de los hallazgos del QA transversal (AtlasERPBackend)

- Fecha: 2026-10-29 · Repos afectados: AtlasERPBackend · Predecesor: `AtlasDocumentationHub/10-testing/qa-flujo-completo-2026-10-28` (hallazgo BUG-5)
- Resultado observable: un caso de onboarding `OPEN` cuyo expediente en Atlas ya fue decidido por el Motor (autoservicio del comercio) pasa a `VERIFICADO`/`RECHAZADO` al pulsar «Pedir verificación al Motor», en vez de quedar sin salida con `PARTNER_NOT_UNDER_REVIEW`.
- Kill-test: con el expediente `approved` en Atlas y el caso `OPEN`, `POST /b2b/onboarding/cases/:id/kyb-review` devuelve 409 y el caso sigue `OPEN` sin veredicto (reproducido el 2026-10-28, `12-onboarding-comercio/06-erp-kyb-pedido.png`).

## Alcance
- IN: `KybVerificationService.requestKybReview` + prueba unitaria.
- OUT: UI del ERP (el botón «Pedir verificación» ya está habilitado en `OPEN`), cambios en AtlasBackend.
- Ambigüedades: ninguna.

## H1 — BUG-5: expediente ya decidido antes de pedir la verificación
**CA:** Dado un caso `OPEN` con expediente enlazado y ya decidido en Atlas, cuando el operador pide la verificación, entonces el ERP trae el veredicto vigente y el caso pasa al estado que le corresponde; si el expediente no tiene ningún veredicto que traer, el error original se conserva.
**DoD:** `yarn jest kyb-verification` verde · `yarn type-check` · `yarn lint` · repetición contra el stack local del caso de `12-onboarding-comercio`.
**Estado:** A MEDIAS

### H1.S1 — Sincronizar en lugar de rendirse
| ID | Microtarea | CA (binario) | DoD | Estado |
|---|---|---|---|---|
| H1.S1.M1 | Reconocer `PARTNER_NOT_UNDER_REVIEW` y llamar a `syncKybDecision` | el caso queda VERIFICADO con la decisión de Atlas | `yarn jest kyb-verification` | HECHO |
| H1.S1.M2 | Sin veredicto que traer, relanzar el 409 original | el caso sigue en su estado previo y el error es el de Atlas | misma suite | HECHO |
| H1.S1.M3 | Repetir contra el stack local | el caso del hallazgo pasa a VERIFICADO desde «Pedir verificación» | captura/salida | A MEDIAS |

## Riesgos y bloqueos previstos
| Riesgo | Impacto | Mitigación |
|---|---|---|
| Aprobar un caso por un veredicto que no se pidió desde el ERP | Medio | `applyKybDecision` ya valida el desenlace; la compuerta dura de activación sigue exigiendo `APROBADO` del Motor |

## H2 — OBS-6: el mensaje de activación distingue «contrato que aún no entra en vigor»
**CA:** Dado un comercio cuyo contrato ACTIVE arranca en el futuro, cuando se intenta activar, entonces el error dice desde cuándo rige.
**DoD:** `yarn jest src/modules/b2b-sales-crm` + `yarn type-check`.
**Estado:** HECHO

| ID | Microtarea | CA (binario) | DoD | Estado |
|---|---|---|---|---|
| H2.S1.M1 | `ActivationContractResolver.explainMissing` + uso en `MerchantActivationService` | mensaje con fecha; sin contrato conserva el texto previo | `yarn jest src/modules/b2b-sales-crm` → 29 suites / 305 pruebas | HECHO |

## H3 — BUG-6: asignar la cuenta contable por defecto de un socio responde 409
**CA:** Dado un socio con sus siete cuentas por defecto auto-provisionadas sin cuenta, cuando se asigna una cuenta GL a un propósito, entonces el `PUT default-accounts` actualiza esa fila (200) y no choca con el índice único `(business_partner_id, account_purpose)`.
**DoD:** `yarn jest business-partners` + `yarn type-check` + repetir el clic en el ERP con `dist` reconstruido.
**Estado:** HECHO

| ID | Microtarea | CA (binario) | DoD | Estado |
|---|---|---|---|---|
| H3.S1.M1 | `upsert` con `conflictFields: ['business_partner_id','account_purpose']` | la llamada lleva `conflictFields` | `yarn jest src/modules/accounting/business-partners` | HECHO |
| H3.S1.M2 | Repetir en el navegador la asignación de las siete cuentas | `PUT … 200` ×7 y facturar a ese socio deja de dar `PARTNER_DEFAULT_ACCOUNT_NOT_SET` | script `h4-bp-ficha.cjs` | HECHO |
