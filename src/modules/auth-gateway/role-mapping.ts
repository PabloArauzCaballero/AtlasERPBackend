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
  MERCHANT_OPERATIONS: ['MERCHANT_ADMIN', 'COMMERCIAL_EXECUTIVE'],
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
