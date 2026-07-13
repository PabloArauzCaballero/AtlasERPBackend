export interface AuthUser {
  sub: string;
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
