import type { Request } from 'express';

/**
 * Cookie del token de identidad upstream. Es la MISMA que emite el gateway de autenticación; aquí
 * sólo se lee.
 */
const UPSTREAM_ACCESS_COOKIE = 'atlas_upstream_at';

/** La prueba de reautenticación del comercio (`POST /auth/merchant/reauthenticate`). */
export const REAUTH_TOKEN_HEADER = 'x-reauth-token';

/** Roles del comercio que pueden usar el portal. Es la puerta de ESTE backend, no la de AtlasBackend. */
export const COMERCIO = ['merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN'] as const;

/** El token de acceso upstream de la sesión del actor, o `undefined` si no hay cookie. */
export function upstreamAccessToken(req: Request): string | undefined {
  return (req.cookies as Record<string, string> | undefined)?.[UPSTREAM_ACCESS_COOKIE];
}
