import type { Request, Response } from 'express';
import { env } from '../../config/env';
import type { AuthSessionResult } from './auth-gateway.service';
import type { RefreshedUpstreamTokens, UpstreamTokens } from './auth-gateway.types';

/**
 * Cookies upstream de la pasarela de autenticación: se guardan al iniciar sesión, se renuevan
 * cuando AtlasBackend refresca los tokens y se borran al cerrarla. Los cuatro controladores de
 * `auth/*` las comparten, de ahí que vivan fuera de cualquiera de ellos.
 */
const UPSTREAM_ACCESS_COOKIE = 'atlas_upstream_at';
export const UPSTREAM_REFRESH_COOKIE = 'atlas_upstream_rt';

/**
 * Alcance del token de ACCESO upstream: todo el prefijo de la API.
 *
 * Estaba limitado a `/api/v1/auth`, y esa restricción dejaba de tener sentido en cuanto este
 * backend empezó a hacer de pasarela de dominio hacia AtlasBackend —el expediente del partner—:
 * el navegador simplemente no manda la cookie a una ruta fuera de su `path`, así que la pasarela
 * se quedaba sin credencial y la única salida habría sido darle una credencial de MÁQUINA, capaz
 * de operar el expediente de cualquier comercio.
 *
 * Se amplía el de acceso y **no** el de refresco, que es el que de verdad importa: el de acceso
 * dura una hora y sólo sirve para actuar como quien ya inició sesión; el de refresco emite
 * sesiones nuevas y sigue confinado a `/api/v1/auth`. Lo que protegía la restricción original
 * —que JS no pueda leerla y que no viaje a otro origen— lo siguen dando `httpOnly`, `secure` y
 * `sameSite`, que no se tocan.
 */
const UPSTREAM_ACCESS_COOKIE_PATH = '/api/v1';
/** El de refresco no se amplía: emite sesiones, y sólo el gateway de autenticación lo necesita. */
const UPSTREAM_COOKIE_PATH = '/api/v1/auth';

/** Guarda las cookies upstream y devuelve la sesión propia del ERP. */
export function issueSession(res: Response, session: AuthSessionResult) {
  setUpstreamCookies(res, {
    accessToken: session.upstreamAccessToken,
    refreshToken: session.upstreamRefreshToken,
  });
  return {
    accessToken: session.accessToken,
    tokenType: session.tokenType,
    expiresIn: session.expiresIn,
    user: session.user,
  };
}

export function readCookie(req: Request, name: string): string | undefined {
  return (req.cookies as Record<string, string> | undefined)?.[name];
}

export function readUpstreamTokens(req: Request): UpstreamTokens {
  return {
    accessToken: readCookie(req, UPSTREAM_ACCESS_COOKIE),
    refreshToken: readCookie(req, UPSTREAM_REFRESH_COOKIE),
  };
}

export function reapplyRefreshedCookies(
  res: Response,
  refreshedTokens: RefreshedUpstreamTokens | undefined,
): void {
  if (refreshedTokens) setUpstreamCookies(res, refreshedTokens);
}

export function setUpstreamCookies(res: Response, tokens: RefreshedUpstreamTokens): void {
  const secure = env.NODE_ENV === 'production';
  res.cookie(UPSTREAM_ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: 60 * 60 * 1000,
    path: UPSTREAM_ACCESS_COOKIE_PATH,
  });
  res.cookie(UPSTREAM_REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: UPSTREAM_COOKIE_PATH,
  });
}

export function clearUpstreamCookies(res: Response): void {
  // Cada cookie se borra con SU path: el navegador sólo elimina la que coincide, así que
  // limpiar el token de acceso con la ruta del de refresco lo dejaría vivo en el navegador
  // después de cerrar sesión — un cierre que no cierra nada.
  res.clearCookie(UPSTREAM_ACCESS_COOKIE, { path: UPSTREAM_ACCESS_COOKIE_PATH });
  res.clearCookie(UPSTREAM_REFRESH_COOKIE, { path: UPSTREAM_COOKIE_PATH });
}
