# Plan — Auditoría de seguridad con mapeo COBIT 5 (AtlasERPBackend)

- Fecha: 2026-10-28 · Repos afectados: AtlasERPBackend (únicamente) · Rama: `claude/gallant-thompson-wp8f28` · Predecesor: ninguno
- Resultado observable: cada hallazgo confirmado en el código del ERP queda documentado (archivo:línea, CWE/OWASP, proceso COBIT 5) y los de corrección mínima quedan corregidos con una prueba que los demuestra.
- Kill-test: un PATCH sobre una factura AR `ISSUED` con `status: "PAID"` sigue siendo aceptado, o una factura con neto 100.10 e impuesto 13.01 sigue fallando por coma flotante.

> **Aclaración de marco.** COBIT 5 es un marco de gobierno y gestión de TI, no una norma certificable.
> Este trabajo entrega un MAPEO hallazgo → proceso COBIT 5 y evidencia técnica; no es una certificación,
> ni una opinión de cumplimiento.

## Alcance

- IN: `/home/user/AtlasERPBackend` (código `src/`, `test/`, Dockerfile, compose, `contracts/`, dependencias, migraciones SQL).
- OUT: los demás repos de Atlas (AtlasBackend, portales, motor de decisión). Lo roto fuera de alcance se anota, no se arregla.
- Reglas: sin dependencias nuevas, sin APIs inventadas, sin `skip`/`only`, sin debilitar pruebas, sin secretos reales en archivos.
- Ambigüedades registradas:
  1. ¿El PATCH de `/accounting/receipts/:id` y `/accounting/billing/ar-invoices/:id` lo usa algún cliente para cambiar `status` a mano? Supuesto: no hay flujo legítimo (los estados los mueven la emisión, los cobros y la anulación fiscal). A confirmar con: responsable del front del ERP.
  2. ¿Se admite que el límite de intentos de login lo haga sólo AtlasBackend? Supuesto: sí; no se toca. A confirmar con: seguridad/infra.

## H1 — Descubrimiento y hallazgos verificados

**CA:** Dado el repo, cuando se revisan autenticación, autorización, SQL, dinero, terceros, contenedores y dependencias, entonces cada hallazgo cita archivo:línea leído y los falsos positivos se descartan.
**DoD:** lista de hallazgos con CWE/OWASP/COBIT en `REPORTE.md`; `yarn audit` guardado en `evidencia/`.
**Estado:** HECHO (alcance de descubrimiento parcial: ver REPORTE.md › No cubierto)

| ID       | Microtarea                                                                       | CA (binario)                                       | DoD                                                         | Estado                                                |
| -------- | -------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| H1.S1.M1 | Revisar JWT, guards, bypass de auth y variables de entorno                       | cada afirmación cita archivo:línea                 | lectura de `jwt-auth.guard.ts`, `env.ts`, compose           | HECHO (lectura; no es verificación de comportamiento) |
| H1.S1.M2 | Revisar SQL crudo (`sequelize.query`) y aislamiento por entidad legal / comercio | cada `query(` clasificada                          | `grep` + lectura                                            | HECHO                                                 |
| H1.S1.M3 | Revisar dinero (float, idempotencia, inmutabilidad)                              | hallazgos citados                                  | lectura de recibos, facturas AR, validador de partida doble | HECHO                                                 |
| H1.S1.M4 | Revisar llamadas a terceros, pasarelas y webhooks (timeout, firma)               | hallazgos citados                                  | `grep fetch/axios` + lectura                                | HECHO                                                 |
| H1.S1.M5 | Dependencias                                                                     | `yarn audit` ejecutado o BLOCKED con error literal | `evidencia/yarn-audit.txt`                                  | HECHO (evidencia/yarn-audit.txt)                      |
| H1.S1.M6 | Dockerfile/compose/CORS/helmet/rate limit/errores                                | hallazgos citados                                  | lectura                                                     | HECHO                                                 |

## H2 — Correcciones mínimas con prueba

**CA:** Dado cada hallazgo corregible con cambio mínimo, cuando se ejecuta su prueba dirigida, entonces pasa y la prueba falla sin el arreglo.
**DoD:** `yarn type-check`, `yarn lint`, jest dirigido en verde, salida literal en `evidencia/`.
**Estado:** HECHO

| ID       | Microtarea                                                                                                           | CA (binario)                                                                                       | DoD                                                                        | Estado                              |
| -------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------- |
| H2.S1.M1 | Importes exactos en factura AR (bruto) y recibos (suma de asignaciones y saldo) sin coma flotante                    | neto 100.10 + impuesto 13.01 emite sin `INVALID_JOURNAL_LINE`; asignaciones comparadas en centavos | `jest test/money-exact-ar-receipts.spec.ts`                                | HECHO (evidencia/jest-dirigido.txt) |
| H2.S1.M2 | PATCH de factura AR y de recibo no cambia `status` fuera de DRAFT→VOID ni fechas/banco de un documento contabilizado | 409 con código estable; el `update` no se llama                                                    | `jest test/ar-receipt-patch-immutability.spec.ts`                          | HECHO (evidencia/jest-dirigido.txt) |
| H2.S1.M3 | Gateway: rechazar segmentos `.`/`..` en la ruta reenviada a AtlasBackend                                             | 400 y no hay llamada HTTP                                                                          | `jest src/modules/partner-onboarding-gateway/atlas-partner.client.spec.ts` | HECHO (evidencia/jest-dirigido.txt) |
| H2.S1.M4 | JWT de sesión (plano de acceso) sin `exp` se rechaza                                                                 | 401                                                                                                | `jest test/security-hardening.spec.ts` (caso nuevo)                        | HECHO (evidencia/jest-dirigido.txt) |
| H2.S1.M5 | Los compose de despliegue no pueden llevar `AUTH_DISABLED_FOR_LOCAL_TESTING`                                         | prueba falla si aparece fuera de `docker-compose.authoff.yml`                                      | `jest test/compose-files.spec.ts`                                          | HECHO (evidencia/jest-dirigido.txt) |

## H3 — Reporte y cierre

**CA:** `REPORTE.md` con avance en la primera línea, mapeo COBIT 5, evidencia y no cubierto.
**DoD:** archivo escrito; commit local sin push.
**Estado:** A MEDIAS (falta el archivo `REPORTE.md`)

| ID       | Microtarea                             | CA (binario)                          | DoD                 | Estado                                                                                                                                                                                                                                |
| -------- | -------------------------------------- | ------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H3.S1.M1 | Escribir `REPORTE.md`                  | existe con las secciones obligatorias | `ls`                | HECHO: el agente no pudo escribirlo (la herramienta lo rechazó para subagentes); lo escribió la sesión coordinadora |
| H3.S1.M2 | Commit local con la atribución exigida | `git log -1`                          | salida de `git log` | HECHO (commit local, sin push)                                                                                                                                                                                                        |

## Riesgos y bloqueos previstos

| Riesgo                                                  | Impacto                         | Mitigación                                                                    |
| ------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| Sin base de datos: las pruebas de integración no corren | No se puede alcanzar `VERIFIED` | Pruebas unitarias con dobles declarados; se declara BLOCKED lo de integración |
| El PATCH lo usa algún cliente                           | Un 409 inesperado en el front   | Se permite el no-op (mismo valor) y DRAFT→VOID; se registra como ambigüedad   |
