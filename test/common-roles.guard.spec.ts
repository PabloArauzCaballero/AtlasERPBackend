import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { RolesGuard } from '../src/common/guards/roles.guard';
import type { PinoLoggerService } from '../src/common/logging/pino-logger.service';
import type { AuthUser, RequestWithAuthUser } from '../src/common/types/auth-context.types';

describe('RolesGuard', () => {
  function buildGuard(requiredRoles: string[]): RolesGuard {
    const reflector: Pick<Reflector, 'getAllAndOverride'> = {
      getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
    };
    const logger: Pick<PinoLoggerService, 'debugContext' | 'warnContext'> = {
      debugContext: jest.fn(),
      warnContext: jest.fn(),
    };
    return new RolesGuard(
      reflector as unknown as Reflector,
      logger as unknown as PinoLoggerService,
    );
  }

  function buildContext(user: AuthUser): ExecutionContext {
    const request: RequestWithAuthUser = {
      user,
      headers: {},
      method: 'GET',
      url: '/api/v1/example',
    };

    return {
      getHandler: () => ({ name: 'handler' }),
      getClass: () => class TestController {},
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  it('autoriza roles aunque el módulo use mayúsculas y el token use minúsculas', () => {
    const guard = buildGuard(['ADMIN']);

    expect(guard.canActivate(buildContext({ sub: 'user-1', role: 'admin' }))).toBe(true);
  });

  it('autoriza roles aunque el módulo use minúsculas y el token use mayúsculas', () => {
    const guard = buildGuard(['admin']);

    expect(guard.canActivate(buildContext({ sub: 'user-1', role: 'ADMIN' }))).toBe(true);
  });

  it('rechaza usuarios autenticados sin rol suficiente', () => {
    const guard = buildGuard(['ADS_FINANCE']);

    expect(() => guard.canActivate(buildContext({ sub: 'user-1', role: 'ADS_AUDITOR' }))).toThrow(
      ForbiddenException,
    );
  });
});
