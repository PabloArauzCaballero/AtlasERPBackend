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
} from './auth-gateway.types';

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
      if (status !== undefined && status >= 400 && status < 500)
        return new BadRequestException(message);
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

  replaceUserRoles(
    accessToken: string,
    id: string,
    body: unknown,
  ): Promise<AtlasInternalAccessProfile> {
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
}
