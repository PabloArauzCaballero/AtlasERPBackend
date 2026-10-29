> **AVANCE: 6 / 7 — 85,7 %.**

- Fecha: 2026-10-29 · Plan: [PLAN.md](./PLAN.md) · Rama: `claude/compassionate-franklin-p7u3rw`
- Peldaño de evidencia alcanzado: `TESTED`.

## Completado
| ID | Qué se logró | Comando | Resultado |
|---|---|---|---|
| H1.S1.M1 | Si Atlas responde `PARTNER_NOT_UNDER_REVIEW`, el ERP trae el veredicto (`syncKybDecision`) y el caso pasa a VERIFICADO | `yarn jest src/modules/b2b-sales-crm` | PASS (29 suites, 302 pruebas) |
| H1.S1.M2 | Sin veredicto que traer, se conserva el 409 original y el caso vuelve a su estado; otro 409 no se confunde | misma suite (2 pruebas nuevas) | PASS |
| H2.S1.M1 | OBS-6: «activar» dice que el contrato aún no entra en vigor y desde cuándo | `yarn jest src/modules/b2b-sales-crm` | PASS (305 pruebas) · type-check exit 0 · lint 0 errores |
| H3.S1.M1 | BUG-6 (hallado en la pasada H4): `setDefaultAccount` usa `upsert` con `conflictFields (business_partner_id, account_purpose)`; antes respondía 409 porque la PK es `id` | `yarn jest src/modules/accounting/business-partners` | PASS (2 pruebas); type-check, lint, check:file-size OK |
| H3.S1.M2 | BUG-6 repetido en el navegador con `dist` reconstruido: 7 asignaciones de cuenta | script `h4-bp-cuentas.cjs` (scratchpad) | `PUT … 200` ×7; BD: 7 filas con `gl_account_id` (5 existentes actualizadas + 2 insertadas); luego la factura AR a ese socio se emitió (`POST 201`), quedó `PARTIALLY_PAID` tras un recibo |
| H4.S1.M1 | OBS-26: el error de «sin cuenta bancaria» ya no manda a una «Tesorería» inexistente: dice que Bancos es de consulta y que Administración la carga | `yarn jest src/modules/accounting/shared` | PASS (24 pruebas, 1 nueva) · type-check exit 0 · check:file-size OK |

## A medias
### H1.S1.M3 — Repetir contra el stack local
- Qué anda: lógica y pruebas unitarias; `yarn type-check` exit 0, `yarn lint` sin errores, `check:file-size` OK.
- Qué no anda: no se ejercitó el caso real (BUG-5) en el stack con `dist` reconstruido.
- Qué falta exactamente: `yarn build`, reiniciar el ERP backend y pulsar «Pedir verificación» sobre un caso cuyo partner ya está aprobado en Atlas.
- Dónde quedó: rama indicada, compila.

## Pendiente
| ID | Estado | Qué lo destraba |
|---|---|---|
| — | ninguno | — |

## Evidencia
```text
yarn type-check -> exit 0 · yarn jest src/modules/b2b-sales-crm -> 29 passed / 302 passed
```

## No cubierto
- Camino real con Atlas arriba (solo pruebas con doble de `AtlasPartnerClient`: nivel correcto, sin veredicto y otro 409).

## Desvíos del plan
Ninguno.

## Riesgos residuales
- La detección del código es por texto en la respuesta (`PARTNER_NOT_UNDER_REVIEW`); si Atlas cambia el mensaje, vuelve al 409.

## Decisiones y ambigüedades
- Se trae el veredicto en vez de dejar el caso `OPEN`; confirmar con producto que es el comportamiento deseado.
