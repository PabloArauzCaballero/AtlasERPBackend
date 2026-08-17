import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AccessTokenIssuerService } from './access-token-issuer.service';
import { AtlasIdentityClient } from './atlas-identity.client';
import { mapAtlasRolesToBusinessRoles } from './role-mapping';
import type {
  AtlasInternalAuthResponse,
  AtlasInternalPermissionListItem,
  AtlasInternalRoleListItem,
  AtlasInternalUserProfile,
  RefreshedUpstreamTokens,
  UpstreamTokens,
} from './auth-gateway.types';

export interface AuthSessionResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: AtlasInternalUserProfile;
  upstreamAccessToken: string;
  upstreamRefreshToken: string;
}

interface ProxyResult<T> {
  result: T;
  refreshedTokens?: RefreshedUpstreamTokens;
}

@Injectable()
export class AuthGatewayService {
  constructor(
    private readonly identityClient: AtlasIdentityClient,
    private readonly tokenIssuer: AccessTokenIssuerService,
  ) {}

  private buildSession(auth: AtlasInternalAuthResponse): AuthSessionResult {
    const businessRoles = mapAtlasRolesToBusinessRoles(auth.user.roles);
    const issued = this.tokenIssuer.issue({
      sub: auth.user.id,
      roles: businessRoles,
      email: auth.user.email,
    });

    return {
      accessToken: issued.accessToken,
      tokenType: 'Bearer',
      expiresIn: issued.expiresIn,
      user: auth.user,
      upstreamAccessToken: auth.accessToken,
      upstreamRefreshToken: auth.refreshToken,
    };
  }

  /**
   * Ejecuta una llamada autenticada contra AtlasBackend, rotando el token upstream una vez si
   * hace falta (access token ausente/expirado). Devuelve los tokens rotados para que el
   * controller los vuelva a guardar en las cookies httpOnly del navegador.
   */
  private async callWithRetry<T>(
    tokens: UpstreamTokens,
    fn: (accessToken: string) => Promise<T>,
  ): Promise<ProxyResult<T>> {
    if (!tokens.accessToken) {
      if (!tokens.refreshToken) {
        throw new UnauthorizedException('Sesión no disponible. Inicia sesión nuevamente.');
      }
      const refreshed = await this.identityClient.refresh(tokens.refreshToken);
      const result = await fn(refreshed.accessToken);
      return {
        result,
        refreshedTokens: {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
        },
      };
    }

    try {
      const result = await fn(tokens.accessToken);
      return { result };
    } catch (error) {
      if (!(error instanceof UnauthorizedException) || !tokens.refreshToken) throw error;
      const refreshed = await this.identityClient.refresh(tokens.refreshToken);
      const result = await fn(refreshed.accessToken);
      return {
        result,
        refreshedTokens: {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
        },
      };
    }
  }

  async login(email: string, password: string): Promise<AuthSessionResult> {
    const auth = await this.identityClient.login(email, password);
    return this.buildSession(auth);
  }

  async refresh(upstreamRefreshToken: string | undefined): Promise<AuthSessionResult> {
    if (!upstreamRefreshToken) {
      throw new UnauthorizedException('Sesión no disponible. Inicia sesión nuevamente.');
    }
    const auth = await this.identityClient.refresh(upstreamRefreshToken);
    return this.buildSession(auth);
  }

  async logout(
    upstreamRefreshToken: string | undefined,
    allDevices: boolean,
  ): Promise<{ loggedOut: boolean }> {
    if (!upstreamRefreshToken) return { loggedOut: true };
    return this.identityClient.logout(upstreamRefreshToken, allDevices);
  }

  async me(tokens: UpstreamTokens): Promise<ProxyResult<AtlasInternalUserProfile>> {
    const { result, refreshedTokens } = await this.callWithRetry(tokens, (at) =>
      this.identityClient.me(at),
    );
    return { result: result.user, refreshedTokens };
  }

  async listUsers(tokens: UpstreamTokens): Promise<ProxyResult<AtlasInternalUserProfile[]>> {
    const { result, refreshedTokens } = await this.callWithRetry(tokens, (at) =>
      this.identityClient.listUsers(at),
    );
    return { result: result.items, refreshedTokens };
  }

  async getUser(
    tokens: UpstreamTokens,
    id: string,
  ): Promise<ProxyResult<AtlasInternalUserProfile>> {
    const { result, refreshedTokens } = await this.callWithRetry(tokens, (at) =>
      this.identityClient.getUser(at, id),
    );
    return { result: result.user, refreshedTokens };
  }

  async updateUser(
    tokens: UpstreamTokens,
    id: string,
    body: unknown,
  ): Promise<ProxyResult<AtlasInternalUserProfile>> {
    const { result, refreshedTokens } = await this.callWithRetry(tokens, (at) =>
      this.identityClient.updateUser(at, id, body),
    );
    return { result: result.user, refreshedTokens };
  }

  async replaceUserRoles(
    tokens: UpstreamTokens,
    id: string,
    body: unknown,
  ): Promise<ProxyResult<AtlasInternalUserProfile>> {
    const { result, refreshedTokens } = await this.callWithRetry(tokens, (at) =>
      this.identityClient.replaceUserRoles(at, id, body),
    );
    return { result: result.user, refreshedTokens };
  }

  async listRoles(tokens: UpstreamTokens): Promise<ProxyResult<AtlasInternalRoleListItem[]>> {
    const { result, refreshedTokens } = await this.callWithRetry(tokens, (at) =>
      this.identityClient.listRoles(at),
    );
    return { result: result.items, refreshedTokens };
  }

  async getRole(
    tokens: UpstreamTokens,
    id: string,
  ): Promise<ProxyResult<AtlasInternalRoleListItem>> {
    return this.callWithRetry(tokens, (at) => this.identityClient.getRole(at, id));
  }

  async listPermissions(
    tokens: UpstreamTokens,
  ): Promise<ProxyResult<AtlasInternalPermissionListItem[]>> {
    const { result, refreshedTokens } = await this.callWithRetry(tokens, (at) =>
      this.identityClient.listPermissions(at),
    );
    return { result: result.items, refreshedTokens };
  }
}
