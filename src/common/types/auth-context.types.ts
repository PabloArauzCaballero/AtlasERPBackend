export interface AuthUser {
  /** Usuario interno de ESTE backend (uuid de `atlas_sales.internal_users`) o usuario de comercio. */
  sub: string;
  /** Identificador opaco que emitió AtlasBackend para la misma persona; sólo para trazas y llamadas upstream. */
  atlasUserId?: string;
  roleCode?: string;
  role?: string;
  roles?: string[];
  email?: string;
  legalEntityIds?: string[];
  tokenType?: string;
}

export interface RequestWithAuthUser {
  user?: AuthUser;
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  url?: string;
  requestId?: string;
}
