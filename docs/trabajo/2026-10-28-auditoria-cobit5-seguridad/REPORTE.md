> **AVANCE: 13 / 13 — 100,0 %.** Mide las microtareas del plan, no la cobertura de la auditoría: los hallazgos SEC-06 (parcial) y SEC-07 a SEC-16 siguen abiertos.

# Reporte — Auditoría de seguridad con mapeo COBIT 5 · AtlasERPBackend

- Fecha: 2026-10-28 · Plan: [PLAN.md](./PLAN.md) · Rama: `claude/gallant-thompson-wp8f28` · Commit de código: `5b76efb` (local, sin push)
- Peldaño de evidencia alcanzado: **TESTED** (tests dirigidos y suite unitaria en verde). No se alcanzó VERIFIED: la integración contra PostgreSQL real y la matriz HTTP de autorización quedaron BLOCKED (ver Evidencia).
- Aclaración: COBIT 5 es un marco de gobierno de TI, no una norma de código. Este reporte entrega el mapeo hallazgo → proceso COBIT 5 y la evidencia técnica; **no es una certificación ni una evaluación de capacidad**.
- Nota de procedencia: el `REPORTE.md` no lo pudo escribir el agente auditor (la herramienta de escritura se lo rechazó para subagentes). Lo redactó la sesión coordinadora a partir del informe del agente y de `evidencia/`. No se re-ejecutó ningún gate al redactarlo.

## Completado

| ID | Qué se logró | Comando de verificación | Resultado |
|---|---|---|---|
| H1.S1.M1–M6 | Revisión por lectura: JWT/guards/bypass, SQL crudo y aislamiento, dinero, terceros/webhooks, dependencias, Dockerfile/CORS/rate limit | lectura + `grep` + `yarn audit` | HECHO (lectura; no es verificación de comportamiento). `evidencia/yarn-audit.txt` |
| H2.S1.M1 | SEC-02/03: importes exactos (centavos bigint) en factura AR y recibos | `jest test/money-exact-ar-receipts.spec.ts` | PASS, `evidencia/jest-dirigido.txt` |
| H2.S1.M2 | SEC-01: PATCH no cambia `status` fuera de DRAFT→VOID ni fechas/banco de documentos contabilizados (409) | `jest test/ar-receipt-patch-immutability.spec.ts` | PASS, `evidencia/jest-dirigido.txt` |
| H2.S1.M3 | SEC-04: el gateway rechaza segmentos `.`/`..` | `jest src/modules/partner-onboarding-gateway/atlas-partner.client.spec.ts` | PASS. **No se corrió en rojo contra el código anterior** |
| H2.S1.M4 | SEC-05: JWT de sesión sin `exp` se rechaza (plano de acceso) | `jest test/security-hardening.spec.ts` | PASS |
| H2.S1.M5 | SEC-06 (parcial): prueba que prohíbe el bypass de auth en los compose de despliegue | `jest test/compose-files.spec.ts` | PASS |
| H3.S1.M1 | Este reporte | `ls docs/trabajo/2026-10-28-auditoria-cobit5-seguridad/REPORTE.md` | existe |
| H3.S1.M2 | Commit local con la atribución exigida | `git log -1` | `5b76efb`, sin push |

Con el código anterior de `src/` fallaron 14 casos de las pruebas nuevas (dinero, PATCH, JWT): `evidencia/jest-rojo-sin-arreglo.txt`.

## A medias

### SEC-06 — Bypass de autenticación fuera de producción
- Qué anda: en `NODE_ENV=production` el servicio falla al arrancar si el bypass está activo (probado en `test/common-jwt-auth.guard.spec.ts:145`). Hay una prueba nueva que prohíbe el bypass en los compose de despliegue.
- Qué no anda: el bloqueo solo rige con `NODE_ENV=production` (`env.ts:372`, `Dockerfile.dev:84`), y el entorno DEV/TEST desplegado corre con `development`.
- Qué falta exactamente: decisión de operaciones sobre cómo bloquear el bypass en entornos desplegados que no son producción.
- Dónde quedó: `5b76efb`, compila, tests en verde.

## Pendiente

| ID | Estado | Qué lo destraba |
|---|---|---|
| SEC-07 | NO CORREGIDO | Recibos y facturas AR sin clave de idempotencia (`receipts.controller.ts:42`, `billing.controller.ts:77`); `externalRef` opcional en `merchant-payments`. Requiere migración y cabecera en el frontend. |
| SEC-08 | NO CORREGIDO | Login, PIN y reset solo con el tope global de 120/min por IP del proxy (sin `trust proxy`). Bajar el tope bloquearía a todos tras el proxy. Confirmar si el límite lo hace AtlasBackend. |
| SEC-09 | NO CORREGIDO | `files.controller.ts:49`: diez roles de staff leen y dan de baja archivos de cualquier dueño. Falta la matriz de roles por tipo de dueño. |
| SEC-10 | NO CORREGIDO | Dependencias de producción: 5 altas y 10 moderadas (`zod` 3.x, `follow-redirects`, `body-parser`, `qs`, `multer`, `moment`, `uuid`). Toca `yarn.lock`; `zod` exige cambio de versión mayor. `multer` no se usa. |
| SEC-11 | NO CORREGIDO | `documents.controller.ts:44`: roles de comercio imprimen contenido libre con el membrete `atlas-erp`. Decisión de negocio. |
| SEC-12 a SEC-16 | NO CORREGIDO (baja/info) | SSE sin plazo de conexión (`support-media-gateway.controller.ts:100`); tope 6000/min del webhook de Core antes de verificar la firma (`core-events.controller.ts:40`); `positiveMoney` sin máximo (`accounting.schemas.ts:19`); cookie `secure` solo en producción; plano interno sin exigir `exp`. |

## Hallazgos y mapeo COBIT 5

| ID | Sev. | Archivo:línea | CWE / OWASP | COBIT 5 | Estado |
|---|---|---|---|---|---|
| SEC-01 | Alta | `ar-invoice-maintenance.service.ts:23`, `receipts.service.ts:64` | CWE-840/915, API3, A06 | DSS06.02/.03, BAI06.01, MEA02 | CORREGIDO (`5b76efb`) |
| SEC-02 | Media | `ar-invoice-issuance.service.ts:56` | CWE-1339/682 | DSS06.02, BAI03 | CORREGIDO |
| SEC-03 | Baja | `receipts.service.ts` | CWE-1339 | DSS06.02 | CORREGIDO |
| SEC-04 | Baja | `atlas-partner.client.ts:28,78,155` | CWE-22, A01 | DSS05.02/.03 | CORREGIDO |
| SEC-05 | Media | `jwt-auth.guard.ts:168` | CWE-613, A07 | DSS05.04 | CORREGIDO (plano de acceso) |
| SEC-06 | Media | `env.ts:372`, `Dockerfile.dev:84` | CWE-489, A02 | DSS05.04, BAI06.01 | PARCIAL |
| SEC-07 | Media | `receipts.controller.ts:42`, `billing.controller.ts:77` | CWE-841 | DSS06.02 | NO CORREGIDO |
| SEC-08 | Media | login / PIN / reset | CWE-307 | DSS05.04/.07 | NO CORREGIDO |
| SEC-09 | Media | `files.controller.ts:49` | CWE-639 | DSS06.03 | NO CORREGIDO |
| SEC-10 | Media | `package.json`, `yarn.lock` | CWE-1395, A03 | BAI03.05, APO12 | NO CORREGIDO |
| SEC-11 | Baja | `documents.controller.ts:44` | CWE-345 | — | NO CORREGIDO |
| SEC-12–16 | Baja/Info | ver Pendiente | — | — | NO CORREGIDO |

Descartados tras leer el código: inyección SQL (todo `sequelize.query` usa bind/replacements; `document-numbering` interpola solo constantes), BOLA en portal/sucursales/bnpl/facturas, algoritmo/iss/aud del JWT, firma HMAC del webhook de Core, CORS, error filter en producción, Dockerfile de producción (usuario `node`).

## Evidencia

Todo en `evidencia/` (salida literal): `typecheck-base.txt`, `typecheck-final.txt`, `lint-final.txt`, `format-check.txt`, `check-file-size.txt`, `build.txt`, `jest-dirigido.txt`, `jest-rojo-sin-arreglo.txt`, `jest-unit-completo.txt`, `defecto-bruto-flotante.txt`, `yarn-audit.txt`, `yarn-audit-produccion.txt`, `integracion-bloqueada.txt`.

Resumen informado por el agente (no re-ejecutado al redactar este reporte): `type-check`, `lint`, `format:check`, `check:file-size` y `build` con exit 0; `yarn test` con 145 suites pasando y 1 omitida, 1965 pruebas pasando y 4 omitidas (ya estaban omitidas). El primer `check:file-size` falló (receipts 462 líneas) y se corrigió a 421.

Integración: **BLOCKED**. Error literal: `[integración] SALTADA «factura AR y recibo: registro y borrado (PostgreSQL real)»: falta ERP_INTEGRATION_DATABASE_URL (PostgreSQL migrado).`

## No cubierto

- Descubrimiento por muestreo: no se leyó a fondo `ads`, `fiscal/siat` (XML/CUF/SOAP), `catalog`, `outbox`, MDR/cobertura BNPL ni las migraciones SQL en busca de destructivas.
- No se ejecutó la matriz HTTP de autorización (requiere base) ni pruebas de integración o E2E contra PostgreSQL real.
- No se auditaron despliegues reales (Coolify, TLS, proxy) ni se contrastó `/contracts`.
- Ningún arreglo llegó a VERIFIED, solo a TESTED, con dobles declarados.
- MEA01-03 no es evaluable desde el código.

## Desvíos del plan

- H3.S1.M1 (este reporte) no lo escribió el agente por rechazo de la herramienta; lo escribió la sesión coordinadora.
- `atlas-partner.client.spec.ts` no se corrió en rojo contra el código anterior.

## Riesgos residuales

- SEC-07 (sin idempotencia en cobros) y SEC-09 (acceso a archivos de cualquier dueño) siguen abiertos y afectan dinero y datos.
- SEC-06: un DEV/TEST desplegado con `NODE_ENV=development` podría correr con la autenticación apagada.
- El cambio de SEC-01 es nuevo para los clientes: un PATCH de `status` que antes pasaba ahora devuelve 409.

## Decisiones y ambigüedades

- Con el responsable del frontend: ¿algún cliente cambia `status` por PATCH? El 409 es nuevo.
- Con seguridad/infraestructura: ¿el límite de intentos de login lo aplica AtlasBackend?
- Secretos a rotar: ninguno real. Solo marcadores de prueba o desarrollo (`change-this-…`, `local-development-…`, `ci_secret_…`); si alguno se usó en un entorno desplegado, ROTAR.
