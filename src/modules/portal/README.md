# Módulo Portal del comercio

## Responsabilidad

Expone `/api/v1/portal/*`: el canal por el que el **usuario partner** (comercio afiliado) consulta
su plan y suscripción, sus sucursales, su panel de facturación, y prende o apaga sus campañas
publicitarias. Es el único punto del backend donde una misma sesión toca a la vez CRM
(`atlas_sales`), contabilidad y publicidad (`ad_*`), por lo que concentra todas las decisiones de
autorización por tenant.

## Archivos

- `portal.module.ts`: registra controller, servicios y modelos de los tres dominios involucrados.
- `portal.controller.ts`: handlers delgados. `@Roles` decide _quién llama_; nunca _qué puede tocar_.
- `portal.scope.service.ts`: autorización por tenant (`PortalScope`). Punto de entrada obligatorio.
- `portal.service.ts`: casos de uso y transacciones.
- `portal.schemas.ts`: validación Zod de body, params y query, con topes de paginación.
- `portal.mappers.ts`: proyecciones explícitas de salida. Ningún modelo Sequelize sale crudo.
- `portal.constants.ts`: vocabulario de roles, estados y límites del canal.

## De dónde sale la identidad

El usuario partner se autentica en `POST /api/v1/auth/merchant/login`, que delega en el canal
`/merchant/auth/*` de **AtlasBackend**: allí vive su identidad (`iam.merchant_users`), igual que la
de los usuarios internos y la de los clientes BNPL.

La división es deliberada y conviene no borrarla:

| Pregunta                                     | Quién responde                                  |
| -------------------------------------------- | ----------------------------------------------- |
| ¿Quién es esta persona? ¿Puede autenticarse? | **AtlasBackend** — `iam.merchant_users`         |
| ¿De qué comercio es? ¿Qué puede tocar?       | **Este backend** — `atlas_sales.merchant_users` |

El enlace entre ambas es el `sub` del token, que este backend guarda en `merchant_users.user_id`.
Ese identificador es **opaco**: AtlasBackend emite bigints (`"1"`, `"27"`) y las fixtures locales
usan UUID, así que la columna es texto y el alcance no valida su formato. Declararla `uuid` dejó
durante un tiempo el enlace preferente inservible —no casaba nunca, todo se resolvía por el correo
de respaldo— sin que nada fallara a la vista.

Antes de existir ese canal, `MERCHANT_ADMIN` se fabricaba mapeándolo desde el rol interno
`MERCHANT_OPERATIONS`: el "usuario partner" era, en el único login real que existía, personal de
Atlas. Si alguien vuelve a añadir `MERCHANT_ADMIN` a un rol interno para desatascar un 403, está
reintroduciendo exactamente eso.

## Modelo de alcance

`PortalScopeService` resuelve el alcance **contra la base, no contra el JWT**:

| Población     | Roles                                                 | Alcance                                                                                           |
| ------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Comercio      | `MERCHANT_ADMIN`                                      | Cuentas con membresía `ACTIVE` en `atlas_sales.merchant_users`. Nunca elige la cuenta: se deriva. |
| Staff interno | `ADMIN`, `COMMERCIAL_MANAGER`, `COMMERCIAL_EXECUTIVE` | Cualquier comercio, pero debe indicar la cuenta; cada uso queda registrado como acceso delegado.  |

Reglas que no se negocian:

1. **Fail-closed**: un usuario partner sin membresía activa recibe `PORTAL_SCOPE_NOT_PROVISIONED`
   (403) aunque su JWT traiga el rol correcto.
2. Ningún `merchantAccountId`, `accountId`, `advertiserId` o `id` de campaña recibido del cliente
   llega a la capa de datos sin pasar antes por `assertAccountAccess` / `assertAdvertiserAccess`.
3. Los identificadores de cuenta son opcionales en los schemas **a propósito**: el comercio no los
   necesita y, si los envía, se validan contra su alcance; el staff interno sí debe enviarlos.
4. Toda denegación se registra con `warn` estructurado, con `userId` y roles, sin datos sensibles.

## Reglas de negocio propias del canal

- **Toggle de campaña** (`PATCH /portal/campaigns/:id/status`): comparte las invariantes de la
  consola administrativa vía `ads/ads.campaign-transitions.ts` — en particular, jamás activar sin
  aprobación de moderación. Suma las del canal: anunciante `ACTIVE` y no bloqueado por riesgo, solo
  campañas ya lanzadas (`ACTIVE`/`PAUSED`), presupuesto no agotado y campaña dentro de su vigencia.
  Bloquea la fila (`LOCK UPDATE`) y escribe `ad_audit_log` + `business_action_logs` en la misma
  transacción. Es idempotente si el estado deseado ya es el actual.
- **Suscripción** (`POST /portal/subscription`): la cuenta debe estar en un estado contratable
  (`QUALIFIED`, `CUSTOMER`); la transición toma lock sobre la fila de la cuenta antes de cerrar la
  suscripción anterior y abrir la nueva, y el fin de período se calcula con `common/time/billing-period.util` (un `setMonth(+1)`
  ingenuo desborda de mes: 31-ene → 3-mar). El índice único parcial
  `uq_merchant_subscriptions_active_account` sostiene la invariante de "una sola suscripción
  activa por comercio" a nivel de motor, no solo de aplicación.
- **Panel de facturación** (`GET /portal/billing`): los totales se agregan en SQL sobre el universo
  completo y se normalizan como decimal exacto (`common/money/decimal-amount.util`), no en punto
  flotante sobre la página truncada; la lista de documentos sí viene acotada a
  `PORTAL_BILLING_DOCUMENT_LIMIT`.
- **Listados**: todos paginados, con tope duro `PORTAL_MAX_PAGE_SIZE` aplicado en el schema.

## Observabilidad

| Operación                | `business_action_logs`                                                     | `ad_audit_log`                                                |
| ------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Crear plan               | `MERCHANT_PLAN_ADMINISTRATION` / `CREATE_MERCHANT_PLAN`                    | —                                                             |
| Contratar o cambiar plan | `MERCHANT_SUBSCRIPTION` / `SELECT_MERCHANT_PLAN` \| `CHANGE_MERCHANT_PLAN` | —                                                             |
| Prender/apagar campaña   | `MERCHANT_CAMPAIGN_CONTROL` / `PORTAL_UPDATE_CAMPAIGN_STATUS`              | `PORTAL_UPDATE_CAMPAIGN_STATUS` con estado previo y posterior |

Cada mutación viaja con `requestId` como correlador y el `sub` del actor.

## Pruebas

- `portal.schemas.spec.ts`: contrato de entrada (topes, enums, normalización, decimales).
- `portal.scope.service.spec.ts`: autorización por tenant y acceso delegado del staff.
- `portal.service.spec.ts`: transiciones de campaña, suscripción y totales de facturación.
- `../ads/ads.campaign-transitions.spec.ts`: invariantes compartidas con la consola administrativa.
- `yarn smoke:portal`: verifica en un entorno desplegado que el canal es fail-closed y que un
  identificador de otro comercio responde 403.

## Qué no debe ir aquí

- Alta y edición de campañas o anunciantes: son operaciones internas del módulo `ads`.
- Reglas de moderación, delivery o ledger publicitario.
- Contabilidad: el portal solo lee documentos ya emitidos.
