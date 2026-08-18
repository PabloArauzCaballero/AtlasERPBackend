import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosError, Method } from 'axios';
import { firstValueFrom } from 'rxjs';
import { env } from '../../config/env';
import type {
  AtlasInternalAccessProfile,
  AtlasInternalAuthResponse,
  AtlasInternalPermissionListItem,
  AtlasInternalRoleListItem,
  AtlasInternalUserProfile,
  AtlasMerchantAuthResponse,
  AtlasMerchantUserProfile,
} from './auth-gateway.types';

/**
 * Nombres de las cookies de sesión que emite AtlasBackend
 * (`common/utils/http/auth-cookies.util.ts`). Si allá cambian, aquí deja de haber sesión: por eso
 * `withSessionTokens` falla en vez de emitir un token propio sin respaldo upstream.
 */
const ATLAS_ACCESS_COOKIE = 'atlas_internal_access';
const ATLAS_REFRESH_COOKIE = 'atlas_internal_refresh';

/**
 * Extrae `nombre=valor` de las cabeceras `set-cookie`. No interpreta atributos (`Path`, `HttpOnly`,
 * `Max-Age`): este gateway no es un navegador, sólo necesita el valor para reenviarlo al upstream.
 */
export function parseSetCookies(header: string[] | string | undefined): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const entry of Array.isArray(header) ? header : [header]) {
    const [pair] = entry.split(';');
    const separator = pair?.indexOf('=') ?? -1;
    if (!pair || separator <= 0) continue;
    cookies[pair.slice(0, separator).trim()] = decodeURIComponent(pair.slice(separator + 1).trim());
  }
  return cookies;
}

interface AtlasEnvelope<T> {
  data?: T;
  error?: { code?: string; message?: string };
  requestId?: string;
  timestamp?: string;
}

/**
 * Cliente HTTP saliente hacia AtlasBackend (fuente de verdad de usuarios internos/roles/permisos).
 * Desenvuelve su contrato de respuesta ({data}/{error}, sin campo `success` — distinto del
 * contrato {success,data} de este mismo backend) y traduce sus errores a excepciones Nest.
 */
@Injectable()
export class AtlasIdentityClient {
  constructor(private readonly http: HttpService) {}

  private baseHeaders(): Record<string, string> {
    return { 'x-tenant-id': env.ATLAS_IDENTITY_TENANT_ID, Accept: 'application/json' };
  }

  private authHeaders(accessToken: string): Record<string, string> {
    return { ...this.baseHeaders(), Authorization: `Bearer ${accessToken}` };
  }

  /**
   * Igual que `request`, pero devolviendo también las cookies de la respuesta.
   *
   * AtlasBackend entrega los tokens de sesión en cookies `HttpOnly` y los QUITA del cuerpo: es
   * deliberado, para que el JavaScript de un navegador no pueda leerlos. Este gateway no es un
   * navegador, así que los recoge de `set-cookie`; el cuerpo queda como respaldo por si el
   * upstream vuelve a incluirlos.
   */
  private async requestWithCookies<T>(
    method: Method,
    path: string,
    options: { body?: unknown; accessToken?: string } = {},
  ): Promise<{ data: T; cookies: Record<string, string> }> {
    try {
      const response = await firstValueFrom(
        this.http.request<AtlasEnvelope<T> | T>({
          method,
          url: `${env.ATLAS_IDENTITY_BASE_URL}/${path.replace(/^\/+/, '')}`,
          data: options.body,
          headers: options.accessToken ? this.authHeaders(options.accessToken) : this.baseHeaders(),
          timeout: env.ATLAS_IDENTITY_TIMEOUT_MS,
        }),
      );

      const payload = response.data;
      const data =
        payload && typeof payload === 'object' && 'data' in payload ? ((payload as AtlasEnvelope<T>).data as T) : (payload as T);
      return { data, cookies: parseSetCookies(response.headers['set-cookie']) };
    } catch (error) {
      throw this.translateError(error);
    }
  }

  private async request<T>(
    method: Method,
    path: string,
    options: { body?: unknown; accessToken?: string } = {},
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.http.request<AtlasEnvelope<T> | T>({
          method,
          url: `${env.ATLAS_IDENTITY_BASE_URL}/${path.replace(/^\/+/, '')}`,
          data: options.body,
          headers: options.accessToken ? this.authHeaders(options.accessToken) : this.baseHeaders(),
          timeout: env.ATLAS_IDENTITY_TIMEOUT_MS,
        }),
      );

      const payload = response.data;
      if (payload && typeof payload === 'object' && 'data' in payload) {
        return (payload as AtlasEnvelope<T>).data as T;
      }
      return payload as T;
    } catch (error) {
      throw this.translateError(error);
    }
  }

  private translateError(error: unknown): Error {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const envelope = error.response?.data as AtlasEnvelope<unknown> | undefined;
      const message = envelope?.error?.message ?? 'Error al contactar el servicio de identidad.';

      if (status === 401) return new UnauthorizedException(message);
      if (status === 403) return new ForbiddenException(message);
      if (status === 404) return new NotFoundException(message);
      if (status !== undefined && status >= 400 && status < 500) return new BadRequestException(message);
      return new InternalServerErrorException('El servicio de identidad no está disponible.');
    }
    return new InternalServerErrorException('El servicio de identidad no está disponible.');
  }

  login(email: string, password: string): Promise<AtlasInternalAuthResponse> {
    return this.request('post', 'internal/auth/login', { body: { email, password } });
  }

  refresh(refreshToken: string): Promise<AtlasInternalAuthResponse> {
    return this.request('post', 'internal/auth/refresh', { body: { refreshToken } });
  }

  logout(refreshToken: string, allDevices: boolean): Promise<{ loggedOut: boolean }> {
    return this.request('post', 'internal/auth/logout', { body: { refreshToken, allDevices } });
  }

  me(accessToken: string): Promise<AtlasInternalAccessProfile> {
    return this.request('get', 'internal/auth/me', { accessToken });
  }

  listUsers(accessToken: string): Promise<{ items: AtlasInternalUserProfile[] }> {
    return this.request('get', 'internal/users', { accessToken });
  }

  getUser(accessToken: string, id: string): Promise<AtlasInternalAccessProfile> {
    return this.request('get', `internal/users/${id}`, { accessToken });
  }

  updateUser(accessToken: string, id: string, body: unknown): Promise<AtlasInternalAccessProfile> {
    return this.request('patch', `internal/users/${id}`, { body, accessToken });
  }

  replaceUserRoles(accessToken: string, id: string, body: unknown): Promise<AtlasInternalAccessProfile> {
    return this.request('patch', `internal/users/${id}/roles`, { body, accessToken });
  }

  listRoles(accessToken: string): Promise<{ items: AtlasInternalRoleListItem[] }> {
    return this.request('get', 'internal/roles', { accessToken });
  }

  getRole(accessToken: string, id: string): Promise<AtlasInternalRoleListItem> {
    return this.request('get', `internal/roles/${id}`, { accessToken });
  }

  listPermissions(accessToken: string): Promise<{ items: AtlasInternalPermissionListItem[] }> {
    return this.request('get', 'internal/permissions', { accessToken });
  }
  // ---- Canal del comercio afiliado -----------------------------------------------------------
  // Población distinta de la interna: otro endpoint, otro vocabulario de roles y ninguna
  // capacidad sobre `/internal/*`.

  async merchantLogin(email: string, password: string): Promise<AtlasMerchantAuthResponse> {
    const { data, cookies } = await this.requestWithCookies<Omit<AtlasMerchantAuthResponse, 'accessToken' | 'refreshToken'>>(
      'post',
      'merchant/auth/login',
      { body: { email, password } },
    );
    return this.withSessionTokens(data, cookies);
  }

  async merchantRefresh(refreshToken: string): Promise<AtlasMerchantAuthResponse> {
    const { data, cookies } = await this.requestWithCookies<Omit<AtlasMerchantAuthResponse, 'accessToken' | 'refreshToken'>>(
      'post',
      'merchant/auth/refresh',
      { body: { refreshToken } },
    );
    return this.withSessionTokens(data, cookies);
  }

  merchantMe(accessToken: string): Promise<AtlasMerchantUserProfile> {
    return this.request('get', 'merchant/auth/me', { accessToken });
  }

  merchantLogout(refreshToken: string, allDevices: boolean): Promise<{ loggedOut: boolean }> {
    return this.request('post', 'merchant/auth/logout', { body: { refreshToken, allDevices } });
  }

  /**
   * Sin tokens no hay sesión: fallar aquí y no más adelante evita emitir un token de este backend
   * respaldado por una sesión upstream que no existe.
   */
  private withSessionTokens(
    data: Omit<AtlasMerchantAuthResponse, 'accessToken' | 'refreshToken'> & Partial<AtlasMerchantAuthResponse>,
    cookies: Record<string, string>,
  ): AtlasMerchantAuthResponse {
    const accessToken = data.accessToken ?? cookies[ATLAS_ACCESS_COOKIE];
    const refreshToken = data.refreshToken ?? cookies[ATLAS_REFRESH_COOKIE];
    if (!accessToken || !refreshToken) {
      throw new UnauthorizedException('El servicio de identidad no devolvió una sesión de comercio utilizable.');
    }
    return { accessToken, refreshToken, user: data.user };
  }

}
