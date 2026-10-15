import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Cookie del token de identidad upstream. Es la MISMA que emite el gateway de autenticación; aquí
 * sólo se lee, igual que en `partner-onboarding-gateway.controller.ts`.
 */
const UPSTREAM_ACCESS_COOKIE = 'atlas_upstream_at';

/** El token si la sesión lo lleva; `undefined` si no. Para rutas que degradan sin él. */
export function optionalUpstreamToken(req: Request): string | undefined {
  return (req.cookies as Record<string, string> | undefined)?.[UPSTREAM_ACCESS_COOKIE];
}

/**
 * El token con el que este backend habla con AtlasBackend en nombre de quien llama.
 *
 * Se exige explícitamente en vez de degradar a una llamada sin identificar: encolar un alta de
 * acceso de forma anónima dejaría la petición sin autor, y el autor es medio expediente. El 401
 * es honesto —la sesión del ERP existe, la del proveedor de identidad no—, y se resuelve
 * volviendo a entrar.
 */
export function requireUpstreamToken(req: Request): string {
  const token = optionalUpstreamToken(req);
  if (!token) {
    throw new UnauthorizedException(
      'La sesión no lleva token de identidad de Atlas: vuelve a iniciar sesión para poder pedir un acceso de comercio.',
    );
  }
  return token;
}
