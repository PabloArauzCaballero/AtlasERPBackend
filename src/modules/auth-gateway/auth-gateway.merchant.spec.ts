import { UnauthorizedException } from '@nestjs/common';
import { AuthGatewayService } from './auth-gateway.service';
import { parseSetCookies } from './atlas-identity.client';
import { mapAtlasRolesToBusinessRoles, mapMerchantRoles } from './role-mapping';
import {
  merchantPasswordResetConfirmSchema,
  merchantPasswordResetRequestSchema,
} from './auth-gateway.schemas';

/**
 * El portal del comercio dependía de una identidad que no existía: `MERCHANT_ADMIN` se fabricaba
 * desde `MERCHANT_OPERATIONS`, que es un rol de EMPLEADO de Atlas. Estas pruebas fijan las dos
 * mitades de la corrección — que el rol interno ya no fabrica al comercio, y que el comercio real
 * llega por su propio canal — porque es exactamente el tipo de mapeo que alguien "restaura"
 * meses después para arreglar un 403 sin saber lo que estaba comprando.
 */
describe('Identidad del comercio en el gateway', () => {
  describe('vocabulario de roles', () => {
    it('MERCHANT_OPERATIONS es staff comercial y ya no otorga MERCHANT_ADMIN', () => {
      const roles = mapAtlasRolesToBusinessRoles(['MERCHANT_OPERATIONS']);
      expect(roles).toContain('COMMERCIAL_EXECUTIVE');
      expect(roles).not.toContain('MERCHANT_ADMIN');
    });

    it('ningún rol interno de AtlasBackend otorga MERCHANT_ADMIN', () => {
      const internalRoles = [
        'SUPER_ADMIN',
        'SYSTEMS_ADMIN',
        'INTERNAL_IDENTITY_ADMIN',
        'FINANCE_MANAGER',
        'OPERATIONS_MANAGER',
        'OPERATIONS_ANALYST',
        'MERCHANT_OPERATIONS',
        'COMPLIANCE_MANAGER',
        'COMPLIANCE_ANALYST',
        'COLLECTIONS_MANAGER',
        'COLLECTIONS_AGENT',
        'AUDITOR_READONLY',
        'EXECUTIVE_READONLY',
        'QA_ENGINEER',
      ];
      expect(mapAtlasRolesToBusinessRoles(internalRoles)).not.toContain('MERCHANT_ADMIN');
    });

    it('el rol merchant del canal propio sí otorga MERCHANT_ADMIN', () => {
      expect(mapMerchantRoles(['merchant'])).toEqual(['MERCHANT_ADMIN']);
    });

    it('un rol upstream desconocido no otorga nada (fail-closed)', () => {
      expect(mapMerchantRoles(['dueño_del_universo'])).toEqual([]);
      expect(mapAtlasRolesToBusinessRoles(['NO_EXISTE'])).toEqual([]);
    });
  });

  describe('sesión del comercio', () => {
    const merchantAuth = {
      accessToken: 'upstream-at',
      refreshToken: 'upstream-rt',
      user: {
        id: '77',
        email: 'comercio@alfa.test',
        fullName: 'Ana Comercio',
        userCode: null,
        phone: null,
        role: 'merchant' as const,
        status: 'active',
        mustChangePassword: false,
        lastLoginAt: null,
      },
    };

    function build(auth = merchantAuth) {
      const identityClient = {
        merchantLogin: jest.fn().mockResolvedValue(auth),
        merchantRefresh: jest.fn().mockResolvedValue(auth),
        merchantLogout: jest.fn().mockResolvedValue({ loggedOut: true }),
      };
      const tokenIssuer = {
        issue: jest.fn().mockReturnValue({ accessToken: 'erp-at', expiresIn: '15m' }),
      };
      return {
        service: new AuthGatewayService(
          identityClient as never,
          tokenIssuer as never,
          { resolveId: jest.fn(async () => 'aaaaaaaa-0000-4000-8000-000000000001') } as never,
        ),
        identityClient,
        tokenIssuer,
      };
    }

    it('emite el token de negocio con MERCHANT_ADMIN y el sub del comercio', async () => {
      const { service, tokenIssuer } = build();

      const session = await service.merchantLogin('comercio@alfa.test', 'x');

      expect(session.accessToken).toBe('erp-at');
      // El `sub` es lo que el portal enlaza contra `atlas_sales.merchant_users.user_id`.
      expect(tokenIssuer.issue).toHaveBeenCalledWith({
        sub: '77',
        roles: ['MERCHANT_ADMIN'],
        email: 'comercio@alfa.test',
      });
    });

    it('rechaza la sesión si el rol upstream no se puede traducir', async () => {
      const { service, tokenIssuer } = build({
        ...merchantAuth,
        user: { ...merchantAuth.user, role: 'otro' as never },
      });

      await expect(service.merchantLogin('comercio@alfa.test', 'x')).rejects.toThrow(
        UnauthorizedException,
      );
      // Una sesión sin roles parecería funcionar y fallaría endpoint a endpoint: no se emite.
      expect(tokenIssuer.issue).not.toHaveBeenCalled();
    });

    it('el refresh sin token upstream no inventa una sesión', async () => {
      const { service } = build();
      await expect(service.merchantRefresh(undefined)).rejects.toThrow(UnauthorizedException);
    });

    it('el logout sin sesión es idempotente', async () => {
      const { service, identityClient } = build();
      await expect(service.merchantLogout(undefined, false)).resolves.toEqual({ loggedOut: true });
      expect(identityClient.merchantLogout).not.toHaveBeenCalled();
    });
  });

  /**
   * «Olvidé mi contraseña» del comercio. El comercio no tenía ninguna salida si perdía su
   * contraseña: el único cambio posible exigía sesión abierta y la contraseña actual, así que un
   * comercio bloqueado sólo podía llamar a soporte para que le fabricaran otra.
   */
  describe('recuperación de contraseña del comercio', () => {
    function build() {
      const identityClient = {
        requestMerchantPasswordReset: jest.fn().mockResolvedValue({ requested: true }),
        confirmMerchantPasswordReset: jest.fn().mockResolvedValue({ passwordChanged: true }),
      };
      return {
        service: new AuthGatewayService(
          identityClient as never,
          { issue: jest.fn() } as never,
          { resolveId: jest.fn() } as never,
        ),
        identityClient,
      };
    }

    it('pide el código sin sesión y devuelve la respuesta genérica', async () => {
      const { service, identityClient } = build();

      await expect(service.requestMerchantPasswordReset('comercio@alfa.test')).resolves.toEqual({
        requested: true,
      });
      expect(identityClient.requestMerchantPasswordReset).toHaveBeenCalledWith(
        'comercio@alfa.test',
      );
    });

    it('confirma con código y contraseña nueva', async () => {
      const { service, identityClient } = build();
      const body = { email: 'comercio@alfa.test', code: '123456', newPassword: 'ContraseñaLarga1' };

      await expect(service.confirmMerchantPasswordReset(body)).resolves.toEqual({
        passwordChanged: true,
      });
      expect(identityClient.confirmMerchantPasswordReset).toHaveBeenCalledWith(body);
    });

    /**
     * El portal valida antes de gastar el código: upstream, un código correcto con una contraseña
     * débil ya consumió el intento y obliga a pedir otro correo.
     */
    it('rechaza códigos que no son de seis dígitos y contraseñas cortas', () => {
      const base = { email: 'comercio@alfa.test', code: '123456', newPassword: 'ContraseñaLarga1' };
      expect(merchantPasswordResetConfirmSchema.safeParse(base).success).toBe(true);
      expect(merchantPasswordResetConfirmSchema.safeParse({ ...base, code: '12345' }).success).toBe(
        false,
      );
      expect(
        merchantPasswordResetConfirmSchema.safeParse({ ...base, code: 'abcdef' }).success,
      ).toBe(false);
      expect(
        merchantPasswordResetConfirmSchema.safeParse({ ...base, newPassword: 'corta123' }).success,
      ).toBe(false);
    });

    it('exige un correo con formato válido para pedir el código', () => {
      expect(merchantPasswordResetRequestSchema.safeParse({ email: 'no-es-correo' }).success).toBe(
        false,
      );
      expect(
        merchantPasswordResetRequestSchema.safeParse({ email: ' comercio@alfa.test ' }).success,
      ).toBe(true);
    });
  });

  describe('lectura de la sesión upstream', () => {
    /**
     * AtlasBackend entrega los tokens en cookies `HttpOnly` y los quita del cuerpo. Este gateway
     * no es un navegador: los recoge de `set-cookie`.
     */
    it('extrae los tokens de las cabeceras set-cookie e ignora los atributos', () => {
      const cookies = parseSetCookies([
        'atlas_internal_access=abc.def; Path=/; HttpOnly; SameSite=Lax',
        'atlas_internal_refresh=rt-999; Path=/; HttpOnly; Max-Age=1209600',
      ]);
      expect(cookies).toEqual({
        atlas_internal_access: 'abc.def',
        atlas_internal_refresh: 'rt-999',
      });
    });

    it('tolera la ausencia de cabecera y las entradas mal formadas', () => {
      expect(parseSetCookies(undefined)).toEqual({});
      expect(parseSetCookies(['basura-sin-igual', '=sin-nombre'])).toEqual({});
    });
  });
});
