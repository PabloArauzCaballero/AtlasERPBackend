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
