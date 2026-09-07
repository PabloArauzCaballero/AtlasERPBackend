import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { RequestWithAuthUser } from '../src/common/types/auth-context.types';

const originalEnv = { ...process.env };

describe('JwtAuthGuard local testing bypass', () => {
  afterEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  it('permite requests protegidas sin Bearer token cuando AUTH_DISABLED_FOR_LOCAL_TESTING=true', async () => {
    jest.resetModules();
    process.env.AUTH_DISABLED_FOR_LOCAL_TESTING = 'true';
    process.env.AUTH_DISABLED_USER_ID = '00000000-0000-0000-0000-000000000001';
    process.env.AUTH_DISABLED_USER_EMAIL = 'postman.test@atlas.test';
    process.env.AUTH_DISABLED_ROLES = 'ADMIN,ADS_AD_SERVER';

    const { JwtAuthGuard } = await import('../src/common/guards/jwt-auth.guard');

    const reflector: Pick<Reflector, 'getAllAndOverride'> = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    };
    const logger = {
      debugContext: jest.fn(),
      warnContext: jest.fn(),
    };
    const request: RequestWithAuthUser = {
      headers: {},
      method: 'POST',
      url: '/api/v1/admin/ads/advertisers',
    };
    const context = {
      getHandler: () => ({ name: 'handler' }),
      getClass: () => class TestController {},
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    const guard = new JwtAuthGuard(reflector as Reflector, logger as never);

    expect(guard.canActivate(context)).toBe(true);
    expect(request.user).toEqual({
      sub: '00000000-0000-0000-0000-000000000001',
      roleCode: 'ADMIN',
      role: 'ADMIN',
      roles: ['ADMIN', 'ADS_AD_SERVER'],
      email: 'postman.test@atlas.test',
      tokenType: 'local-testing-bypass',
    });
  });

  /**
   * El bypass es para las peticiones SIN credencial. Con una, manda la credencial.
   *
   * Es lo que siempre dijo `docker-compose.authoff.yml` y lo que el código no hacía: se fabricaba
   * un ADMIN antes de mirar la cabecera, así que la sesión que el navegador acababa de abrir se
   * descartaba en cada petición. El portal del comercio veía a TODO el mundo como staff interno y
   * le pedía elegir sobre qué comercio operar, con el catálogo entero en el desplegable.
   */
  it('respeta el token cuando llega uno, aunque el bypass local esté activo', async () => {
    jest.resetModules();
    process.env.AUTH_DISABLED_FOR_LOCAL_TESTING = 'true';
    process.env.AUTH_DISABLED_ROLES = 'ADMIN';

    const { env } = await import('../src/config/env');
    const { JwtAuthGuard } = await import('../src/common/guards/jwt-auth.guard');
    const { JwtService } = await import('@nestjs/jwt');

    const token = new JwtService({ secret: env.JWT_ACCESS_SECRET }).sign(
      {
        sub: '9002',
        roleCode: 'MERCHANT_ADMIN',
        role: 'MERCHANT_ADMIN',
        roles: ['MERCHANT_ADMIN'],
        email: 'comercio@atlas.test',
        tokenType: 'access',
      },
      { expiresIn: '5m', issuer: env.JWT_ACCESS_ISSUER, audience: env.JWT_ACCESS_AUDIENCE },
    );

    const request: RequestWithAuthUser = {
      headers: { authorization: `Bearer ${token}` },
      method: 'GET',
      url: '/api/v1/portal/scope',
    };
    const context = {
      getHandler: () => ({ name: 'handler' }),
      getClass: () => class TestController {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const guard = new JwtAuthGuard(
      { getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector,
      { debugContext: jest.fn(), warnContext: jest.fn() } as never,
    );

    expect(guard.canActivate(context)).toBe(true);
    // El comercio sigue siendo el comercio: ni el `sub` ni el rol se sustituyen por los del bypass.
    expect(request.user?.sub).toBe('9002');
    expect(request.user?.roles).toEqual(['MERCHANT_ADMIN']);
    expect(request.user?.tokenType).toBe('access');
  });

  it('rechaza un token inválido en vez de caer al bypass local', async () => {
    jest.resetModules();
    process.env.AUTH_DISABLED_FOR_LOCAL_TESTING = 'true';

    const { JwtAuthGuard } = await import('../src/common/guards/jwt-auth.guard');

    const request: RequestWithAuthUser = {
      headers: { authorization: 'Bearer a.b.c' },
      method: 'GET',
      url: '/api/v1/portal/scope',
    };
    const context = {
      getHandler: () => ({ name: 'handler' }),
      getClass: () => class TestController {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const guard = new JwtAuthGuard(
      { getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector,
      { debugContext: jest.fn(), warnContext: jest.fn() } as never,
    );

    // Un token caducado devuelve al login, que es lo que hay que hacer; volver a convertir en
    // ADMIN a quien traía una sesión es cómo se colaba el desplegable de comercios en el portal.
    expect(() => guard.canActivate(context)).toThrow();
    expect(request.user).toBeUndefined();
  });

  it('bloquea el bypass de autenticación en producción', async () => {
    jest.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.AUTH_DISABLED_FOR_LOCAL_TESTING = 'true';
    process.env.DB_SSL = 'true';
    process.env.JWT_ACCESS_SECRET = 'production_secret_with_more_than_32_characters';
    process.env.JWT_INTERNAL_SECRET = 'production_internal_secret_more_than_32_chars';
    process.env.CORS_ALLOWED_ORIGINS = 'https://atlas.example.com';

    await expect(import('../src/config/env')).rejects.toThrow(
      /AUTH_DISABLED_FOR_LOCAL_TESTING no puede estar activo en producción/,
    );
  });
});
