import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AccessTokenIssuerService } from './access-token-issuer.service';
import { AtlasIdentityClient } from './atlas-identity.client';
import { mapAtlasRolesToBusinessRoles, mapMerchantRoles } from './role-mapping';
import type {
  AtlasInternalAuthResponse,
  AtlasMerchantAuthResponse,
  AtlasMerchantUserProfile,
  AtlasInternalPermissionListItem,
  AtlasInternalRoleListItem,
  AtlasInternalUserProfile,
  RefreshedUpstreamTokens,
  UpstreamTokens,
} from './auth-gateway.types';

export interface MerchantSessionResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: AtlasMerchantUserProfile;
  upstreamAccessToken: string;
  upstreamRefreshToken: string;
}

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
    const issued = this.tokenIssuer.issue({ sub: auth.user.id, roles: businessRoles, email: auth.user.email });

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
      return { result, refreshedTokens: { accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken } };
    }

    try {
      const result = await fn(tokens.accessToken);
      return { result };
    } catch (error) {
      if (!(error instanceof UnauthorizedException) || !tokens.refreshToken) throw error;
      const refreshed = await this.identityClient.refresh(tokens.refreshToken);
      const result = await fn(refreshed.accessToken);
      return { result, refreshedTokens: { accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken } };
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

  async logout(upstreamRefreshToken: string | undefined, allDevices: boolean): Promise<{ loggedOut: boolean }> {
    if (!upstreamRefreshToken) return { loggedOut: true };
    return this.identityClient.logout(upstreamRefreshToken, allDevices);
  }

  async me(tokens: UpstreamTokens): Promise<ProxyResult<AtlasInternalUserProfile>> {
    const { result, refreshedTokens } = await this.callWithRetry(tokens, (at) => this.identityClient.me(at));
    return { result: result.user, refreshedTokens };
  }

  async listUsers(tokens: UpstreamTokens): Promise<ProxyResult<AtlasInternalUserProfile[]>> {
    const { result, refreshedTokens } = await this.callWithRetry(tokens, (at) => this.identityClient.listUsers(at));
    return { result: result.items, refreshedTokens };
  }

  async getUser(tokens: UpstreamTokens, id: string): Promise<ProxyResult<AtlasInternalUserProfile>> {
    const { result, refreshedTokens } = await this.callWithRetry(tokens, (at) => this.identityClient.getUser(at, id));
    return { result: result.user, refreshedTokens };
  }

  async updateUser(tokens: UpstreamTokens, id: string, body: unknown): Promise<ProxyResult<AtlasInternalUserProfile>> {
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
    const { result, refreshedTokens } = await this.callWithRetry(tokens, (at) => this.identityClient.listRoles(at));
    return { result: result.items, refreshedTokens };
  }

  async getRole(tokens: UpstreamTokens, id: string): Promise<ProxyResult<AtlasInternalRoleListItem>> {
    return this.callWithRetry(tokens, (at) => this.identityClient.getRole(at, id));
  }

  async listPermissions(tokens: UpstreamTokens): Promise<ProxyResult<AtlasInternalPermissionListItem[]>> {
    const { result, refreshedTokens } = await this.callWithRetry(tokens, (at) => this.identityClient.listPermissions(at));
    return { result: result.items, refreshedTokens };
  }
  // ---- Canal del comercio afiliado -----------------------------------------------------------

  /**
   * Sesión de un usuario de COMERCIO. La identidad la resuelve AtlasBackend; este backend sólo
   * traduce su rol al vocabulario propio y emite su token de negocio.
   *
   * `MERCHANT_ADMIN` aquí no abre ninguna cuenta: quién puede tocar qué comercio lo decide
   * `PortalScopeService` contra `atlas_sales.merchant_users`. Un comercio con token válido y sin
   * membresía activa sigue recibiendo 403.
   */
  private buildMerchantSession(auth: AtlasMerchantAuthResponse): MerchantSessionResult {
    const businessRoles = mapMerchantRoles([auth.user.role]);
    if (businessRoles.length === 0) {
      // Fail-closed: un rol upstream que no sabemos traducir no se convierte en una sesión sin
      // permisos, se rechaza. Una sesión vacía parecería funcionar y fallaría endpoint a endpoint.
      throw new UnauthorizedException('El rol del usuario de comercio no está habilitado en este backend.');
    }

    const issued = this.tokenIssuer.issue({ sub: auth.user.id, roles: businessRoles, email: auth.user.email });
    return {
      accessToken: issued.accessToken,
      tokenType: 'Bearer',
      expiresIn: issued.expiresIn,
      user: auth.user,
      upstreamAccessToken: auth.accessToken,
      upstreamRefreshToken: auth.refreshToken,
    };
  }

  async merchantLogin(email: string, password: string): Promise<MerchantSessionResult> {
    return this.buildMerchantSession(await this.identityClient.merchantLogin(email, password));
  }

  async merchantRefresh(upstreamRefreshToken: string | undefined): Promise<MerchantSessionResult> {
    if (!upstreamRefreshToken) {
      throw new UnauthorizedException('Sesión no disponible. Inicia sesión nuevamente.');
    }
    return this.buildMerchantSession(await this.identityClient.merchantRefresh(upstreamRefreshToken));
  }

  /**
   * Perfil del comercio autenticado. El front lo usa para restaurar la sesión tras recargar: el
   * token propio de este backend no lleva el perfil, y releerlo del upstream evita mostrar datos
   * de una identidad que entretanto pudo suspenderse.
   */
  async merchantMe(tokens: UpstreamTokens): Promise<ProxyResult<AtlasMerchantUserProfile>> {
    return this.callWithRetry(tokens, (at) => this.identityClient.merchantMe(at));
  }

  async merchantLogout(upstreamRefreshToken: string | undefined, allDevices: boolean): Promise<{ loggedOut: boolean }> {
    // Idempotente: cerrar una sesión que ya no existe no es un error.
    if (!upstreamRefreshToken) return { loggedOut: true };
    return this.identityClient.merchantLogout(upstreamRefreshToken, allDevices);
  }

}
