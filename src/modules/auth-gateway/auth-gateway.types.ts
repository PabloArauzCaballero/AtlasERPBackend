// Formas reales de respuesta de AtlasBackend (módulo internal-users), usadas solo para tipar
// el cliente HTTP saliente de este gateway. No confundir con `AuthUser` (payload del JWT que
// este backend emite) ni con los DTOs propios de este módulo.

export interface AtlasInternalUserProfile {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  name: string;
  userCode: string | null;
  status: string;
  department: string | null;
  jobTitle: string | null;
  mustChangePassword: boolean;
  mfaEnabled: boolean;
  roles: string[];
  legacyRoles: string[];
  permissions: string[];
}

export interface AtlasInternalAuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: AtlasInternalUserProfile;
}

export interface AtlasInternalAccessProfile {
  user: AtlasInternalUserProfile;
}

/**
 * Desafío de segundo factor de AtlasBackend. Lo devuelven DOS flujos con la misma forma —el login
 * interno (`internal/auth/login`) y el cambio de contraseña (`auth/password/change/request`)—, y
 * ambos se completan canjeando `challengeToken` más el código de 6 dígitos que llega por correo.
 */
export interface AtlasPinChallenge {
  pinChallengeRequired: true;
  challengeToken: string;
  expiresInMinutes: number;
}

/**
 * El login interno termina en UNA de dos cosas, y las dos son un éxito: la sesión, o el desafío.
 * Tiparlo como unión es lo que obliga a cada consumidor a decidir qué hace con el desafío en vez
 * de leer `accessToken` de un objeto que no lo trae.
 */
export type AtlasInternalLoginOutcome = AtlasInternalAuthResponse | AtlasPinChallenge;

/**
 * El parámetro es `object` y no la unión concreta a propósito: el mismo predicado decide sobre la
 * respuesta cruda del upstream y sobre la sesión ya construida por este gateway, que no comparten
 * más campo que éste. Estrecharlo obligaría a un `as` en cada uso, que es exactamente el escape que
 * un type guard existe para evitar.
 */
export function isPinChallenge(outcome: object): outcome is AtlasPinChallenge {
  return (outcome as AtlasPinChallenge).pinChallengeRequired === true;
}

export interface AtlasInternalRoleListItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  department: string | null;
  legacyRoleCode: string;
  status: string;
  permissions: string[];
}

export interface AtlasInternalPermissionListItem {
  id: string;
  code: string;
  module: string;
  resource: string;
  action: string;
  description: string | null;
  riskLevel: string;
  requiresReason: boolean;
  requiresMfa: boolean;
}

export interface UpstreamTokens {
  accessToken?: string;
  refreshToken?: string;
}

export interface RefreshedUpstreamTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Perfil del usuario de COMERCIO que devuelve `/merchant/auth/*` de AtlasBackend. Es identidad,
 * no membresía: a qué comercio pertenece esta persona lo resuelve `PortalScopeService` contra
 * `atlas_sales.merchant_users`, no este payload.
 */
export interface AtlasMerchantUserProfile {
  id: string;
  email: string;
  fullName: string | null;
  userCode: string | null;
  phone: string | null;
  role: 'merchant';
  status: string;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
}

export interface AtlasMerchantAuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AtlasMerchantUserProfile;
}

/**
 * Lo que el ERP encola en la cola de altas de identidad de comercio de AtlasBackend.
 *
 * Sin contraseña y sin tenant a propósito: ver `AtlasIdentityClient.enqueueMerchantUserProvisioning`.
 */
export interface AtlasMerchantProvisioningRequestInput {
  externalReference: string;
  accountReference?: string;
  accountName?: string;
  branchName?: string;
  email: string;
  fullName: string;
  phone?: string;
  roleCode?: string;
  requestedBy?: string;
}

/** La petición tal y como la devuelve AtlasBackend. `merchantUserId` sólo viene si ya se concedió. */
export interface AtlasMerchantProvisioningRequest {
  id: string;
  status: 'pending' | 'provisioned' | 'rejected' | string;
  email: string;
  fullName: string;
  merchantUserId: string | null;
  rejectionReason: string | null;
  requestedAt: string;
  decidedAt: string | null;
}
