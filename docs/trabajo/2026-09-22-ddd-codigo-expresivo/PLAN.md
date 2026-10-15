# Plan — DDD y código expresivo: Activación de caso de onboarding B2B

- Fecha: 2026-09-22 · Repo: AtlasERPBackend (backend) · Predecesor: ninguno en esta pasada
- Resultado observable de esta pasada: flujo, regla, evidencia y próxima comprobación definidos sin modificar producto.
- Kill-test: si no se puede seguir `src/modules/b2b-sales-crm/controllers/onboarding.controller.ts` → `src/modules/b2b-sales-crm/services/b2b-onboarding.service.ts`, el diagnóstico no está completo.

## Alcance

- IN: `src/modules/b2b-sales-crm/controllers/onboarding.controller.ts`, `src/modules/b2b-sales-crm/services/b2b-onboarding.service.ts`, `src/modules/b2b-sales-crm/domain/onboarding-lifecycle.ts`, `src/modules/b2b-sales-crm/domain/onboarding-lifecycle.spec.ts`, contrato y prueba de referencia del flujo.
- OUT: migraciones, cambios de API, UX o reglas no confirmadas; resto del repo.
- Ambigüedad registrada: No activar comercios sin aprobación firme del Motor; conservar estados heredados.

## H1 — Diagnóstico y referencia

**CA:** Dado el flujo existente, cuando se inspeccionan entrada, decisión y resultado, entonces la regla tiene un propietario y una prueba de referencia identificables.
**DoD:** inspección de los archivos citados y `npm test -- --runTestsByPath src/modules/b2b-sales-crm/domain/onboarding-lifecycle.spec.ts` con el resultado literal del reporte.
**Estado:** HECHO

### H1.S1 — Rastrear y probar

**CA:** Dado el checkout actual, cuando se sigue el flujo, entonces se distingue regla de coordinación. **DoD:** rutas y símbolos reales registrados abajo. **Estado:** HECHO

| ID       | Microtarea                      | CA (binario)                                 | DoD (comando de verificación)                                                                                                                                   | Estado |
| -------- | ------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| H1.S1.M1 | Localizar entrada y propietario | Ambas rutas existen y se identificó la regla | `test -f 'src/modules/b2b-sales-crm/controllers/onboarding.controller.ts' && test -f 'src/modules/b2b-sales-crm/services/b2b-onboarding.service.ts'` → salida 0 | HECHO  |
| H1.S1.M2 | Fijar referencia                | El chequeo dirigido termina con salida 0     | `npm test -- --runTestsByPath src/modules/b2b-sales-crm/domain/onboarding-lifecycle.spec.ts` → 1 suite; 10/10 pruebas pasan                                     | HECHO  |

**Regla observada:** Un caso listo requiere checklist completo, contrato activo y KYB aprobado.

## H2 — Próxima capacidad acotada

**CA:** Dado el contrato confirmado, cuando se ejerce la condición límite del flujo, entonces el resultado visible o persistido coincide con la regla y un rechazo no produce efecto parcial.
**DoD:** prueba de comportamiento dirigida, verificación de contrato y recorrido real si se modifica código; reporte con salida literal.
**Estado:** HECHO

### H2.S1 — Confirmar semántica antes de refactorizar

**CA:** La condición límite tiene resultado esperado documentado. **DoD:** prueba dirigida y revisión del contrato vigente. **Estado:** HECHO

| ID       | Microtarea                                                     | CA (binario)                                                                             | DoD (comando de verificación)                                                                                                                                             | Estado |
| -------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| H2.S1.M1 | Probar que un caso sin ítems de checklist no cuenta como listo | Dado un caso aprobado y con contrato, pero checklist vacío, el resumen devuelve 0 listos | `npm test -- --runTestsByPath src/modules/b2b-sales-crm/domain/onboarding-lifecycle.spec.ts` → rojo antes, verde después                                                  | HECHO  |
| H2.S1.M2 | Pasar la presencia del checklist a la decisión del resumen     | La misma condición que rechaza la activación excluye el caso del resumen                 | `npm run type-check` → salida 0                                                                                                                                           | HECHO  |
| H2.S1.M3 | Verificar la ruta de aplicación                                | Servicio y dominio conservan sus pruebas dirigidas                                       | `npm test -- --runTestsByPath src/modules/b2b-sales-crm/domain/onboarding-lifecycle.spec.ts src/modules/b2b-sales-crm/services/b2b-onboarding.service.spec.ts` → salida 0 | HECHO  |

## Riesgos y bloqueos previstos

| Riesgo                                                                            | Impacto                    | Mitigación                                                       |
| --------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------- |
| No activar comercios sin aprobación firme del Motor; conservar estados heredados. | Resultado o contrato falso | Confirmar con código, contrato y prueba antes de editar producto |

## Decisión de diseño

El propietario observado es `src/modules/b2b-sales-crm/services/b2b-onboarding.service.ts`. No se introduce una capa DDD nueva por nombre. Una refactorización futura necesitará mostrar una llamada más clara y la misma semántica en la entrada real, con prueba roja antes de cambiar implementación. Si la comprobación H2 demuestra que el diseño actual ya protege la regla, se registra como DESCARTADO el cambio de código.
