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
