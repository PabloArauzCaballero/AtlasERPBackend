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
