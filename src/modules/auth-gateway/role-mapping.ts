// Mapea roles internos de AtlasBackend (INTERNAL_ROLE_CODES) hacia el vocabulario de roles ya
// usado por @Roles(...) en este backend. Cualquier rol de AtlasBackend que no aparezca aquí no
// otorga NINGÚN rol de negocio (fail-closed) — nunca cae a ADMIN por defecto.
//
// El módulo `ads` usa un vocabulario de roles totalmente separado (ADS_ADMIN_VIEWER,
// ADS_ADMIN_MANAGER, ADS_ADMIN_OPERATOR, ADS_FINANCE, ADS_AUDITOR, ADS_MODERATOR,
// ADS_COMPLIANCE_ADMIN, ADS_INVENTORY_MANAGER, ADS_OPS_MONITOR, ADS_AD_SERVER,
// ADS_EVENT_TRACKER) que no se solapa con ADMIN/FINANCE/etc. — confirmado end-to-end (sin este
// bundle, un SUPER_ADMIN de AtlasBackend recibía 403 en /admin/ads/*). Se otorga el bundle
// completo de ads a los roles admin-tier para que mantengan acceso total, igual que tenían con
// AUTH_DISABLED_FOR_LOCAL_TESTING=true.
//
// TODO(auth-gateway): FINANCE_MANAGER recibe hoy el bundle completo ACCOUNTANT/CFO/TREASURY
// porque AtlasBackend todavía no tiene roles financieros más granulares. Separar cuando existan.
const ADMIN_TIER_ADS_BUNDLE = [
  'ADS_ADMIN_VIEWER',
  'ADS_ADMIN_MANAGER',
  'ADS_ADMIN_OPERATOR',
  'ADS_FINANCE',
  'ADS_AUDITOR',
  'ADS_MODERATOR',
  'ADS_COMPLIANCE_ADMIN',
  'ADS_INVENTORY_MANAGER',
  'ADS_OPS_MONITOR',
  'ADS_AD_SERVER',
  'ADS_EVENT_TRACKER',
] as const;

const ATLAS_TO_BUSINESS_ROLES: Readonly<Record<string, readonly string[]>> = {
  SUPER_ADMIN: ['ADMIN', ...ADMIN_TIER_ADS_BUNDLE],
  SYSTEMS_ADMIN: ['ADMIN', ...ADMIN_TIER_ADS_BUNDLE],
  INTERNAL_IDENTITY_ADMIN: ['ADMIN', ...ADMIN_TIER_ADS_BUNDLE],
  FINANCE_MANAGER: ['FINANCE', 'ACCOUNTANT', 'CFO', 'TREASURY', 'ADS_FINANCE'],
  OPERATIONS_MANAGER: ['OPERATIONS', 'COMMERCIAL_MANAGER', 'ADS_OPS_MONITOR'],
  OPERATIONS_ANALYST: ['OPERATIONS', 'ADS_OPS_MONITOR'],
  // `MERCHANT_OPERATIONS` es personal de Atlas que atiende comercios, NO un comercio. Otorgaba
  // `MERCHANT_ADMIN`, que es el rol de la población del portal, y eso era exactamente la avería:
  // no existiendo identidad de comercio en AtlasBackend, el rol del comercio se fabricaba desde un
  // rol de empleado. Hoy esa identidad existe (`/merchant/auth/*`) y llega por `mapMerchantRoles`,
  // así que aquí sólo queda lo que este rol es de verdad: staff comercial, que opera el portal en
  // nombre de un comercio y queda registrado como acceso delegado.
  MERCHANT_OPERATIONS: ['COMMERCIAL_EXECUTIVE'],
  COMPLIANCE_MANAGER: ['LEGAL', 'ADS_COMPLIANCE_ADMIN', 'ADS_MODERATOR'],
  COMPLIANCE_ANALYST: ['LEGAL', 'ADS_MODERATOR'],
  COLLECTIONS_MANAGER: ['COLLECTIONS'],
  COLLECTIONS_AGENT: ['COLLECTIONS'],
  AUDITOR_READONLY: ['AUDITOR', 'ADS_AUDITOR', 'ADS_ADMIN_VIEWER'],
  EXECUTIVE_READONLY: ['AUDITOR', 'ADS_AUDITOR', 'ADS_ADMIN_VIEWER'],
  QA_ENGINEER: ['AUDITOR'],
};

export function mapAtlasRolesToBusinessRoles(atlasRoles: readonly string[]): string[] {
  const mapped = new Set<string>();
  for (const role of atlasRoles) {
    const normalized = role.trim().toUpperCase();
    for (const businessRole of ATLAS_TO_BUSINESS_ROLES[normalized] ?? []) {
      mapped.add(businessRole);
    }
  }
  return [...mapped];
}

/**
 * Roles de negocio de un usuario del COMERCIO afiliado, autenticado contra `/merchant/auth/*` de
 * AtlasBackend. Es un plano distinto del interno: aquí no hay staff, y por eso no se mezcla con
 * `ATLAS_TO_BUSINESS_ROLES`.
 *
 * `MERCHANT_ADMIN` no da acceso a ninguna cuenta por sí solo: el alcance lo resuelve
 * `PortalScopeService` contra las membresías reales del `sub`. Un token válido de un comercio sin
 * membresía activa sigue recibiendo `PORTAL_SCOPE_NOT_PROVISIONED`.
 */
const MERCHANT_TO_BUSINESS_ROLES: Readonly<Record<string, readonly string[]>> = {
  merchant: ['MERCHANT_ADMIN'],
};

export function mapMerchantRoles(upstreamRoles: readonly string[]): string[] {
  const mapped = new Set<string>();
  for (const role of upstreamRoles) {
    for (const businessRole of MERCHANT_TO_BUSINESS_ROLES[role.trim().toLowerCase()] ?? []) {
      mapped.add(businessRole);
    }
  }
  return [...mapped];
}
