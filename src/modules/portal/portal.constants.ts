/**
 * Vocabulario de roles del portal del comercio.
 *
 * Se distinguen dos poblaciones que comparten las mismas rutas:
 *
 * - **Comercio** (`MERCHANT_ADMIN`): usuario partner. Su alcance se deriva SIEMPRE de
 *   `atlas_sales.merchant_users`; nunca puede elegir la cuenta sobre la que opera.
 * - **Staff interno** (`ADMIN`, `COMMERCIAL_MANAGER`, `COMMERCIAL_EXECUTIVE`): opera el portal en
 *   nombre de un comercio durante soporte u onboarding. Puede indicar la cuenta explícitamente,
 *   pero cada uso de esa facultad queda registrado como acceso delegado.
 *
 * Un usuario que tenga ambos perfiles se resuelve como staff interno (superconjunto de permisos),
 * y de todas formas queda auditado.
 */

/** Roles que pueden operar el portal en nombre de cualquier comercio. */
export const PORTAL_INTERNAL_ROLES = [
  'ADMIN',
  'COMMERCIAL_MANAGER',
  'COMMERCIAL_EXECUTIVE',
] as const;

/** Rol del usuario partner, acotado a sus propias cuentas. */
export const PORTAL_MERCHANT_ROLES = ['MERCHANT_ADMIN'] as const;

/** Conjunto completo admitido por los endpoints de lectura del portal. */
export const PORTAL_ROLES = [...PORTAL_INTERNAL_ROLES, ...PORTAL_MERCHANT_ROLES] as const;

/** Roles autorizados a crear o modificar datos maestros de planes (precio comercial). */
export const PORTAL_PLAN_ADMIN_ROLES = ['ADMIN', 'COMMERCIAL_MANAGER'] as const;

/** Estados de `merchant_users` que habilitan el acceso al portal. */
export const PORTAL_ACTIVE_MEMBERSHIP_STATUSES = ['ACTIVE'] as const;

/** Estados de `b2b_accounts.lifecycle_status` que permiten contratar o cambiar de plan. */
export const PORTAL_SUBSCRIBABLE_ACCOUNT_STATUSES = ['QUALIFIED', 'CUSTOMER'] as const;

/** Estados de campaña que el comercio puede alternar desde el portal. */
export const PORTAL_TOGGLEABLE_CAMPAIGN_STATUSES = ['ACTIVE', 'PAUSED'] as const;

/** Tope duro de filas devueltas por los listados del portal. */
export const PORTAL_MAX_PAGE_SIZE = 100;
export const PORTAL_DEFAULT_PAGE_SIZE = 50;

/** Cantidad de documentos recientes que devuelve el panel de facturación. */
export const PORTAL_BILLING_DOCUMENT_LIMIT = 50;

/** Código de módulo usado en `business_action_logs`. */
export const PORTAL_MODULE_CODE = 'PORTAL';
