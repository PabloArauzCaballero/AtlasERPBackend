# Matriz de autorización del ERP (P-13)

Sacada del código de la rama `cumplimiento/permisos` (guards globales de `src/app.module.ts`,
decoradores `@Roles` de cada controlador y las comprobaciones POR RECURSO de los servicios), no de
documentación previa. Cada fila dice quién entra (rol), sobre qué recurso concreto puede actuar y
qué prueba lo demuestra contra HTTP + PostgreSQL real.

## 1. Cómo se autentica y autoriza una petición

| Paso                  | Pieza                                                          | Regla                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Límite             | `ThrottlerGuard` (global)                                      | 120 peticiones/min por cliente.                                                                                                                                                                                                                                                                                                                                                                                   |
| 2. Identidad          | `JwtAuthGuard` (global)                                        | `Authorization: Bearer <jwt>` obligatorio salvo `@Public()`. Verificación LOCAL HS256 (no hay verificador remoto ni lista de revocación). Dos planos: **acceso** (`JWT_ACCESS_SECRET`, `iss=atlas-erp`, `aud=atlas-erp-api`, lo emite `AccessTokenIssuerService` tras el login contra AtlasBackend) y **servicio** (`JWT_INTERNAL_SECRET`, `iss=atlas-internal`, `aud=atlas-ads`). Exige `sub` y al menos un rol. |
| 2b. Plano de servicio | `JwtAuthGuard.assertServicePlaneRoles`                         | Un token del plano interno sólo puede traer roles `ADS_*`; cualquier otro (ADMIN, FINANCE, MERCHANT_ADMIN…) → 401. **Nuevo en P-13.**                                                                                                                                                                                                                                                                             |
| 3. Rol                | `RolesGuard` (global)                                          | El rol del token debe estar en `@Roles` de la ruta (mayúsculas/minúsculas indistintas). Una ruta sin `@Roles` admite cualquier sesión autenticada.                                                                                                                                                                                                                                                                |
| 4. Recurso (contab.)  | `LegalEntityAccessService`                                     | Sólo `ADMIN` opera todas las entidades legales. Cualquier otro rol necesita la entidad en `legalEntityIds` del token; sin la lista → 403 `LEGAL_ENTITY_SCOPE_REQUIRED`, con otra entidad → 403 `LEGAL_ENTITY_FORBIDDEN`. Los listados filtran (`accessibleLegalEntityIds`).                                                                                                                                       |
| 4. Recurso (comercio) | `PortalScopeService` (`resolveScope`, `restrictToOwnAccounts`) | `MERCHANT_ADMIN` sólo alcanza las cuentas de sus membresías `ACTIVE` en `atlas_sales.merchant_users` (por `user_id` = `sub`, o correo del token). Sin membresía activa → 403 `PORTAL_SCOPE_NOT_PROVISIONED`. Staff interno (`ADMIN`, `COMMERCIAL_*`) opera cualquier cuenta y queda auditado como acceso delegado.                                                                                                |
| 5. Referencias ajenas | servicios                                                      | Ids dentro del cuerpo (período, libro, centro de costo/beneficio, contrato, sucursal) deben ser de la misma entidad legal / cuenta que la operación.                                                                                                                                                                                                                                                              |
| Cabeceras / consulta  | —                                                              | Ninguna cabecera ni parámetro de consulta decide identidad, rol, entidad legal ni comercio (`x-legal-entity-id`, `x-tenant-id`, `x-roles`, `x-user-id`, `x-merchant-account-id`, `?sub=`, `?roles=` se ignoran). `x-tenant-id` sólo lo ESCRIBE el ERP hacia AtlasBackend desde `ATLAS_IDENTITY_TENANT_ID`.                                                                                                        |

Mapeo de roles de AtlasBackend (`src/modules/auth-gateway/role-mapping.ts`, fallar cerrado):

| Rol en AtlasBackend                                               | Roles de negocio en el ERP                      |
| ----------------------------------------------------------------- | ----------------------------------------------- |
| SUPER_ADMIN, SYSTEMS_ADMIN, INTERNAL_IDENTITY_ADMIN               | ADMIN + paquete ADS completo                    |
| FINANCE_MANAGER                                                   | FINANCE, ACCOUNTANT, CFO, TREASURY, ADS_FINANCE |
| OPERATIONS_MANAGER / OPERATIONS_ANALYST                           | OPERATIONS (+ COMMERCIAL_MANAGER el manager)    |
| MERCHANT_OPERATIONS (staff)                                       | COMMERCIAL_EXECUTIVE                            |
| COMPLIANCE_MANAGER / COMPLIANCE_ANALYST                           | LEGAL (+ ADS moderación)                        |
| COLLECTIONS_MANAGER / COLLECTIONS_AGENT                           | COLLECTIONS                                     |
| AUDITOR_READONLY, EXECUTIVE_READONLY, QA_ENGINEER                 | AUDITOR (+ ADS lectura)                         |
| Usuario de comercio (`/merchant/auth/*`, rol upstream `merchant`) | MERCHANT_ADMIN                                  |

**El emisor de tokens del ERP no incluye `legalEntityIds`**: hoy un FINANCE_MANAGER real no tiene
alcance de entidad y recibe 403 en toda la contabilidad salvo que sea ADMIN (ver `decisions.md`,
P-13 #1).

## 2. Actores

| Actor de la matriz              | Token en las pruebas                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| Consumidor                      | No aplica al ERP: el consumidor no tiene sesión aquí (vive en AtlasBackend).                      |
| Comercio A / Comercio B         | `MERCHANT_ADMIN`, `sub` = `merchant_users.user_id` de su cuenta (membresía ACTIVE).               |
| Comercio revocado               | `MERCHANT_ADMIN` con membresía `SUSPENDED`.                                                       |
| FINANCE (finanzas)              | `FINANCE` (+ ACCOUNTANT/CFO/TREASURY como el mapeo real), con o sin `legalEntityIds`.             |
| CFO / contable / tesorería de A | `CFO` / `ACCOUNTANT` / `TREASURY` con `legalEntityIds=[A]`.                                       |
| Cobranzas / OPERATIONS          | `COLLECTIONS` / `OPERATIONS`.                                                                     |
| ADMIN                           | `ADMIN` (todas las entidades y cuentas).                                                          |
| Revisor                         | `AUDITOR` (sólo lectura de bitácoras y usuarios).                                                 |
| Cliente técnico S2S             | Plano interno con `ADS_EVENT_TRACKER` / `ADS_AD_SERVER`; manifiesto con `x-platform-catalog-key`. |

## 3. Matriz actor × acción × recurso (rutas financieras)

Leyenda: ✅ permitido · 🔒E sólo recursos de SUS entidades legales · 🔒C sólo SUS cuentas de
comercio · ❌ 403 · — no aplica. «Todas» = sin restricción por recurso (rol interno global).

### 3.1 Contabilidad (`/accounting/*`)

| Recurso · acción                                                                 | ADMIN | ACCOUNTANT     | CFO            | TREASURY       | FINANCE_MANAGER real (FINANCE+ACCOUNTANT+CFO+TREASURY, sin `legalEntityIds`) | COLLECTIONS / OPERATIONS / AUDITOR | Comercio | Servicio (ADS_*) |
| -------------------------------------------------------------------------------- | ----- | -------------- | -------------- | -------------- | ---------------------------------------------------------------------------- | ---------------------------------- | -------- | ---------------- |
| Documento: listar                                                                | ✅    | 🔒E            | 🔒E            | ❌             | vacío                                                                        | ❌                                 | ❌       | ❌               |
| Documento: leer por id `GET /documents/:id`                                      | ✅    | 🔒E            | 🔒E            | ❌             | ❌ 403                                                                       | ❌                                 | ❌       | ❌               |
| Documento: crear / lote / contabilizar / revertir                                | ✅    | 🔒E            | 🔒E            | ❌             | ❌ 403                                                                       | ❌                                 | ❌       | ❌               |
| Asiento: vínculos `journal-entries/:id/links` (leer/crear)                       | ✅    | 🔒E            | 🔒E            | ❌             | ❌ 403                                                                       | ❌                                 | ❌       | ❌               |
| Condiciones de pago a proveedor (listar/leer/simular)                            | ✅    | 🔒E            | 🔒E            | 🔒E            | vacío / ❌                                                                   | ❌                                 | ❌       | ❌               |
| Condiciones de pago a proveedor (crear/editar)                                   | ✅    | 🔒E            | 🔒E            | ❌             | ❌                                                                           | ❌                                 | ❌       | ❌               |
| Maestros por entidad (sucursal, año, período, libro, centros, cuentas bancarias) | ✅    | 🔒E            | 🔒E            | ❌             | vacío                                                                        | ❌                                 | ❌       | ❌               |
| Crear maestros por entidad (sucursal, año, período, libro)                       | ✅    | 🔒E            | 🔒E            | ❌             | ❌                                                                           | ❌                                 | ❌       | ❌               |
| Entidad legal: crear                                                             | ✅    | ❌             | ❌             | ❌             | ❌                                                                           | ❌                                 | ❌       | ❌               |
| Plan de cuentas, cuentas GL, grupos, códigos tributarios (catálogo global)       | ✅    | Todas          | Todas          | ❌             | Todas                                                                        | ❌                                 | ❌       | ❌               |
| Business partners (maestro global); rol por entidad                              | ✅    | Todas; rol 🔒E | Todas; rol 🔒E | Todas; rol 🔒E | Todas; rol ❌                                                                | ❌                                 | ❌       | ❌               |
| Eventos facturables: listar / registrar                                          | ✅    | 🔒E            | ❌             | ❌             | —                                                                            | ❌                                 | ❌       | ❌               |
| Facturas AR: listar / leer (descarga) / editar / borrar / emitir                 | ✅    | 🔒E            | ❌             | ❌             | —                                                                            | ❌                                 | ❌       | ❌               |
| Recibos: listar / editar / borrar / registrar                                    | ✅    | 🔒E            | ❌             | 🔒E            | —                                                                            | ❌                                 | ❌       | ❌               |
| Contratos contables: listar / editar / borrar / crear / términos                 | ✅    | 🔒E            | 🔒E            | ❌             | —                                                                            | ❌                                 | ❌       | ❌               |
| Cierre / reapertura de período                                                   | ✅    | ❌             | 🔒E            | ❌             | —                                                                            | ❌                                 | ❌       | ❌               |
| Outbox contable: estado, muertos, reenvío                                        | ✅    | ❌             | ✅             | ❌             | ✅ (FINANCE)                                                                 | ❌                                 | ❌       | ❌               |

### 3.2 CRM, cobertura, facturación del comercio y archivos

| Recurso · acción                                                                                 | ADMIN                                                                                                                                                | FINANCE | COLLECTIONS | OPERATIONS | COMMERCIAL_* | Comercio (MERCHANT_ADMIN)                         | Servicio                                                        |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------- | ---------- | ------------ | ------------------------------------------------- | --------------------------------------------------------------- |
| Cobertura: cuotas, CxP, recuperaciones, cola de revisión (leer)                                  | ✅                                                                                                                                                   | ✅      | movimientos | ✅         | ❌           | ❌                                                | ❌                                                              |
| Cobertura: programar CxP / barrido                                                               | ✅                                                                                                                                                   | ✅      | ❌          | ✅         | ❌           | ❌                                                | ❌                                                              |
| Cobertura: cancelar, registrar pago, aprobar/rechazar liquidación (doble control)                | ✅                                                                                                                                                   | ✅      | ❌          | ❌         | ❌           | ❌                                                | ❌                                                              |
| Recuperación: aplicar cobro / revertir movimiento                                                | ✅                                                                                                                                                   | ✅ / ✅ | ✅ / ❌     | ❌         | ❌           | ❌                                                | ❌                                                              |
| Facturas del comercio `/b2b/billing` (leer / emitir / pago / al mayor)                           | ✅                                                                                                                                                   | ✅      | ❌          | leer       | ❌           | ❌                                                | ❌                                                              |
| Compras BNPL `/b2b/bnpl/purchases`                                                               | ✅                                                                                                                                                   | ❌      | ❌          | ✅         | ❌           | 🔒C (cuenta derivada, sucursal de la cuenta)      | ❌                                                              |
| Sucursales `/b2b/onboarding/branches` (crear / editar / estado)                                  | ✅                                                                                                                                                   | ❌      | ❌          | ✅         | ❌           | 🔒C **(nuevo en P-13)**                           | ❌                                                              |
| Adjuntos `/files` (firmar subida, registrar, listar, leer, descargar, baja)                      | ✅                                                                                                                                                   | ✅      | ✅          | ✅         | ✅           | 🔒C sólo `B2B_ACCOUNT` propio **(nuevo en P-13)** | ❌                                                              |
| Portal `/portal/*` (alcance, facturación, factura descargable, sucursales, campañas, comisiones) | ✅ delegado                                                                                                                                          | ❌      | ❌          | ❌         | ✅ delegado  | 🔒C                                               | ❌                                                              |
| Portal: crear/editar planes (precio)                                                             | ✅                                                                                                                                                   | ❌      | ❌          | ❌         | MANAGER      | ❌                                                | ❌                                                              |
| Calificación crediticia, conciliación, segmentos, propuestas, contratos B2B                      | según `@Roles` (staff); ninguna admite comercio                                                                                                      |         |             |            |              | ❌                                                | ❌                                                              |
| `merchant-credit/:partnerId/*`, `partner-onboarding/:partnerId/*`, soporte del comercio          | reenvío a AtlasBackend con el token upstream del PROPIO usuario (cookie `atlas_upstream_at`); la propiedad del `partnerId` la comprueba AtlasBackend |         |             |            |              | delegado a Core                                   | ❌                                                              |
| `documents/generate` (PDF)                                                                       | renderiza el contenido que envía el llamador; no lee datos por id                                                                                    |         |             |            |              | ✅ (sin datos ajenos)                             | ❌                                                              |
| Bitácora de negocio `/audit/business-actions` (también AUDITOR y ACCOUNTANT)                     | ✅                                                                                                                                                   | ✅      | ❌          | ❌         | ❌           | ❌                                                | ADS_AUDITOR / ADS_ADMIN_MANAGER ✅ (ver `decisions.md` P-13 #3) |
| Manifiesto `/platform/*`                                                                         | llave `x-platform-catalog-key` propia (sin JWT); sin llave configurada → 503                                                                         |         |             |            |              | ❌                                                | llave                                                           |
| Anuncios `/ads/*` (entrega y eventos)                                                            | —                                                                                                                                                    | —       | —           | —          | —            | ❌                                                | ADS_AD_SERVER / ADS_EVENT_TRACKER                               |

## 4. Brechas encontradas y corregidas en P-13 (BOLA/IDOR y afines)

| #   | Ruta / pieza                                                                                                                           | Antes                                                                                             | Ahora                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | `GET /accounting/documents/:id`                                                                                                        | Cualquier ACCOUNTANT/CFO leía el asiento de otra entidad (200)                                    | 403 `LEGAL_ENTITY_FORBIDDEN`; 404 si no existe                              |
| 2   | `GET/POST /accounting/journal-entries/:id/links`                                                                                       | Leía y vinculaba asientos de otra entidad; id inexistente → 200 vacío                             | 403 por entidad del documento; 404 si no existe                             |
| 3   | `/accounting/supplier-payment-terms` (listar, leer, crear, editar, simular)                                                            | Ninguna ruta miraba la entidad legal                                                              | Listado filtrado; resto 403 fuera de alcance                                |
| 4   | `GET /accounting/financial-structure/{legal-entities,branches,fiscal-years,periods,ledgers,cost-centers,profit-centers,bank-accounts}` | Devolvían las filas de todas las entidades (cuentas bancarias de B a un contable de A)            | Filtrados por las entidades del token; ADMIN ve todas                       |
| 5   | `GET /accounting/billing/events`                                                                                                       | Eventos facturables de todas las entidades                                                        | Filtrado por la entidad del contrato                                        |
| 6   | `POST /accounting/documents` y lotes: `costCenterId` / `profitCenterId` de otra entidad                                                | Aceptado (201): costo imputado en otra sociedad                                                   | 409 `LINE_*_LEGAL_ENTITY_MISMATCH`                                          |
| 7   | `PATCH /b2b/onboarding/branches/:id`, `/status`, `POST /b2b/onboarding/branches`                                                       | Comercio B editaba/cerraba sucursales de A y abría sucursales en la cuenta de A                   | 403 `MERCHANT_ACCOUNT_FORBIDDEN`; membresía suspendida → 403                |
| 8   | `/files` (listar, leer, descargar, baja, firmar subida)                                                                                | Comercio B listaba, leía y daba de baja los documentos KYB de A, y los de la contabilidad interna | 403 `ERP_FILE_FORBIDDEN` antes de llamar a AtlasBackend                     |
| 9   | Plano de servicio (`JWT_INTERNAL_*`)                                                                                                   | Un token de servicio podía declararse ADMIN/FINANCE/MERCHANT_ADMIN y operar como persona          | Sólo roles `ADS_*`; otro rol → 401                                          |
| 10  | Logs (`JwtAuthGuard`, `LoggingInterceptor`, `pino-http`)                                                                               | La URL con su consulta (`?search=<nombre y CI>`, `?token=`) se registraba entera                  | Sólo nombres de parámetros; redacción de correo, teléfono, PIN, contraseñas |
| 11  | `PATCH /accounting/supplier-payment-terms/:id` (defecto hallado al probar)                                                             | Un parche parcial daba 500 (`modalidad` indefinida)                                               | Se revisa la condición resultante real                                      |

Verificado en ROJO contra el código base (`2b2cd3a`) y en VERDE tras la corrección con las mismas
pruebas: 33 fallos de aislamiento/tokens + 1 de logs en rojo, 0 en verde (ver informe del paquete).

## 5. Rol efectivo de base de datos

- **Hoy (medido):** `api` y `migrate` comparten `DATABASE_URL` (`docker-compose.yml`
  `x-erp-env`, y el mismo `.env` de Coolify), y la API arranca con `STARTUP_MIGRATIONS_ENABLED` y
  `STARTUP_SEEDS_ENABLED` en `true` por omisión (`src/config/env.ts`): el runtime es DUEÑO del
  esquema y puede DDL, `TRUNCATE` y `ALTER TABLE … DISABLE TRIGGER` (lo que desactiva los
  disparadores append-only de los hechos contables).
- **Propuesta probada:** `infra/postgres/runtime-role.sql` (grupo `atlas_erp_runtime`: DML sin
  DDL). `test/authz-db-runtime-role.e2e-spec.ts` demuestra DML sí, 42501 en CREATE/ALTER/DROP/
  TRUNCATE/DISABLE TRIGGER/CREATE FUNCTION/lectura del registro de migraciones, y la API arrancando
  y respondiendo con ese rol.
- **BLOQUEADO:** aplicarlo en DEV/TEST/PROD requiere al DBA/SRE (roles y variables de Coolify).

## 6. Redacción de datos en logs y trazas

- Logs: `test/authz-log-redaction.e2e-spec.ts` (aplicación completa en `LOG_LEVEL=debug`).
- Trazas: `RedactingSpanProcessor` ya borraba `url.query` y la consulta de `url.full`/`http.url`
  y los literales SQL (`src/observability/__pruebas__/redacting-span-processor.spec.ts`).

## 7. Fuera del ERP / dependencias

- Propiedad del `partnerId` en `merchant-credit/*`, `partner-onboarding/*` y soporte: la decide
  AtlasBackend con el token del propio usuario (P-13 de Core).
- Revocación de sesiones internas: sin lista de revocación; un token vive `JWT_ACCESS_EXPIRES_IN`
  (15 min por omisión). La revocación de un comercio es inmediata vía su membresía.
