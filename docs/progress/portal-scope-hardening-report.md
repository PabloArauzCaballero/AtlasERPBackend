# Endurecimiento del Portal del comercio (alcance por tenant)

## 1. Objetivo

Cerrar el acceso cruzado entre comercios en `/api/v1/portal/*` y dejar el canal del usuario partner
con el mismo nivel de garantías que el resto del backend: autorización por tenant resuelta contra la
base, invariantes sostenidas por el motor, auditoría de negocio en cada mutación y pruebas que
demuestren las dos cosas que importan (que el comercio puede operar lo suyo y que no puede tocar lo
ajeno).

## 2. Hallazgos de partida

| Hallazgo                                                       | Estado anterior                                                                                   | Riesgo                                                                                          | Acción aplicada                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| El modelo no sabía a qué comercio pertenece un usuario del JWT | `merchant_users` solo guardaba el correo; no había enlace por identidad estable                   | Toda autorización por tenant era imposible: el rol `MERCHANT_ADMIN` habilitaba cualquier cuenta | `user_id` + `email_normalized` (columna generada) e índices de apoyo en `merchant_users`    |
| El anunciante publicitario no estaba enlazado a la cuenta B2B  | `ad_advertiser_accounts` no tenía dueño en el ERP                                                 | `GET /portal/advertisers` degeneraba en un volcado global de anunciantes                        | `merchant_account_id` con FK a `atlas_sales.b2b_accounts` y enlace best-effort por NIT+país |
| Identificadores del cliente usados sin validar                 | `merchantAccountId`, `accountId`, `advertiserId` y el `id` de campaña llegaban a la capa de datos | Lectura y mutación de datos de otro comercio con solo cambiar un UUID                           | `PortalScopeService`: `assertAccountAccess` / `assertAdvertiserAccess` obligatorios         |
| `REPLACED` se escribía sin estar declarado                     | Ninguna restricción cubría el estado de suscripción                                               | Estados no previstos entrando por script o carga manual                                         | `ck_merchant_subscriptions_status` y `ck_merchant_subscriptions_ended_at` (NOT VALID)       |
| Doble suscripción activa posible                               | La unicidad dependía solo del lock de aplicación                                                  | Otro proceso, script o carga manual rompía la invariante sin que nadie se enterara              | Índice único parcial `uq_merchant_subscriptions_active_account`                             |
| Invariantes de campaña duplicadas                              | Las reglas de transición vivían dentro de `AdminAdsService`                                       | El portal habría podido activar campañas sin aprobación de moderación                           | `ads/ads.campaign-transitions.ts` compartido por la consola y el portal                     |
| Totales de facturación sobre la página truncada                | Se sumaban en JavaScript sobre los documentos devueltos                                           | Un panel que muestra menos de lo que el comercio debe                                           | Agregación en SQL sobre el universo completo y decimal exacto (`common/money`)              |
| Fin de período con `setMonth(+1)`                              | Desborda de mes: 31-ene daba 3-mar                                                                | Períodos de facturación mal cerrados                                                            | `common/time/billing-period.util`                                                           |
| `ad_audit_log.request_id` es `uuid`, el correlador no siempre  | Un `X-Request-Id` no-UUID hacía fallar el INSERT de auditoría                                     | La transacción de negocio caía por el registro de auditoría                                     | `normalizeAuditRequestId`: conserva el correlador solo si es UUID                           |
| Las reversas SQL se registraban como aplicadas                 | `run-sql.ts` marcaba cualquier archivo, incluido `.down.sql`                                      | Base revertida con el ledger diciendo "aplicada"; el siguiente `up` se omitía en silencio       | La reversa borra la fila de su migración de ida; ejecución y registro en una transacción    |

## 3. Implementación aplicada

### Migración

- `src/database/migrations/20260817120000-portal-merchant-scope-hardening.sql` (+ `.down.sql`).
- Las restricciones sobre tablas con datos se declaran `NOT VALID`: rigen para toda escritura nueva
  sin abortar la migración por filas heredadas, y se promueven con `VALIDATE CONSTRAINT` una vez
  saneado el histórico.
- El histórico se normaliza **antes** de declarar las restricciones (cierre de suscripciones sin
  `ended_at` y de duplicadas activas, conservando la más reciente).
- Registrada en `db:migrate:portal` y en `db:migrate:prod`.

### Módulo Portal

- `portal.scope.service.ts`: resuelve el alcance contra `atlas_sales.merchant_users`, no contra el
  JWT. Fail-closed: sin membresía `ACTIVE`, `403 PORTAL_SCOPE_NOT_PROVISIONED`. El staff interno
  debe indicar la cuenta y cada uso queda registrado como acceso delegado.
- `portal.constants.ts`: vocabulario de roles, estados contratables, estados alternables y topes.
- `portal.mappers.ts`: proyecciones explícitas. Ningún modelo Sequelize sale crudo; el anunciante no
  expone `taxId`, `creditLimitMicros` ni su contacto interno.
- `portal.schemas.ts`: tope duro `PORTAL_MAX_PAGE_SIZE` en el schema, precio de plan como decimal de
  dos posiciones, `reason` acotado.
- `portal.service.ts`: transacciones con lock de fila en el cambio de plan y en el toggle de
  campaña; ambas operaciones idempotentes cuando el estado pedido ya es el actual.

### Utilitarios compartidos

- `src/common/money/decimal-amount.util.ts`: normalización decimal exacta de importes.
- `src/common/time/billing-period.util.ts`: fin de período sin desbordar de mes.
- `src/modules/ads/ads.campaign-transitions.ts`: invariantes de transición de campaña compartidas
  entre la consola administrativa y el portal.

### Auditoría

| Operación                | `business_action_logs`                                                     | `ad_audit_log`                                                |
| ------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Crear plan               | `MERCHANT_PLAN_ADMINISTRATION` / `CREATE_MERCHANT_PLAN`                    | —                                                             |
| Contratar o cambiar plan | `MERCHANT_SUBSCRIPTION` / `SELECT_MERCHANT_PLAN` \| `CHANGE_MERCHANT_PLAN` | —                                                             |
| Prender/apagar campaña   | `MERCHANT_CAMPAIGN_CONTROL` / `PORTAL_UPDATE_CAMPAIGN_STATUS`              | `PORTAL_UPDATE_CAMPAIGN_STATUS` con estado previo y posterior |

`ad_audit_log.actor_type` distingue ahora `MERCHANT_PORTAL_USER` de `INTERNAL_ATLAS_USER`: quién
apagó una campaña deja de ser una inferencia.

### Datos de prueba y herramientas

- `src/database/seeders/20260818000000-seed-portal-test-fixtures.sql`: comercios Alfa y Beta con
  sucursales, facturas, cobros, anunciantes y campañas, más un usuario con membresía `SUSPENDED`
  para ejercer el camino fail-closed (`npm run db:seed:test-fixtures`).
- `scripts/dev/create-test-jwt.ts`: emite los JWT de esos usuarios (`npm run dev:jwt`). Bloqueado en
  producción.
- `scripts/smoke/portal.smoke.ts`: `npm run smoke:portal`, incorporado a `smoke:all`.

## 4. Verificación ejecutada

| Comprobación           | Resultado                      |
| ---------------------- | ------------------------------ |
| `npm run type-check`   | OK                             |
| `npm run lint`         | OK                             |
| `npm test`             | 17 suites, 121 tests aprobados |
| `npm run test:e2e`     | 1 suite, 2 tests aprobados     |
| `npm run build`        | OK                             |
| `npm run smoke:portal` | 13 casos, todos aprobados      |
| `npm run smoke:batch`  | Aprobado                       |

El smoke del portal se ejecutó en modo autorizado (token del usuario partner del Comercio Alfa) y
cubre las dos mitades del contrato: los seis endpoints de lectura responden `200`, los topes de
paginación y los enums responden `400`, y los cuatro intentos de alcance cruzado —panel de
facturación, sucursales, campañas y toggle de campaña de otro comercio— responden `403`.

## 5. Riesgos y trabajo pendiente

| Riesgo                                                                                                  | Impacto                                                                                      | Mitigación recomendada                                                                   |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Las restricciones quedaron `NOT VALID`                                                                  | El histórico previo puede violarlas sin que el motor lo señale                               | Sanear y promover con `VALIDATE CONSTRAINT` por tabla en una ventana de mantenimiento    |
| Los anunciantes preexistentes se enlazaron best-effort por NIT+país                                     | Un anunciante sin correspondencia exacta y única queda invisible en el portal                | Revisar `ad_advertiser_accounts WHERE merchant_account_id IS NULL` y enlazar manualmente |
| `merchant_users.user_id` se llena desde el alta; el histórico depende del enlace de respaldo por correo | Un usuario antiguo con correo distinto al del JWT no resuelve alcance                        | Backfill de `user_id` contra el directorio de AtlasBackend                               |
| El frontend del ERP todavía no consume el portal endurecido                                             | Los estados de error nuevos (`403 PORTAL_SCOPE_NOT_PROVISIONED`) no tienen tratamiento en UI | Mapear los códigos del canal en `AtlasERPFrontend`                                       |
