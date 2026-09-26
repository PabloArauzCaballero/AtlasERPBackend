import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ANY_AUTHENTICATED_KEY } from '../src/common/decorators/any-authenticated.decorator';
import { IS_PUBLIC_KEY } from '../src/common/decorators/public.decorator';
import { ROLES_KEY } from '../src/common/decorators/roles.decorator';
import { RolesGuard } from '../src/common/guards/roles.guard';
import type { PinoLoggerService } from '../src/common/logging/pino-logger.service';

/**
 * TSK-ERPB-16 · Todo handler HTTP declara quién entra: `@Roles(...)` (no vacío), `@Public()` o
 * `@AnyAuthenticated()`, en el método o en su clase.
 *
 * `RolesGuard` deniega por defecto, así que un handler sin declaración responde 403 a todos; esta
 * prueba lo caza antes de que llegue a producción como «la pantalla nueva no carga». Lee los
 * metadatos REALES de Nest (no el texto), así que ve también los `@Roles` de clase.
 *
 * Los abiertos a cualquier sesión son pocos y a propósito: la lista de abajo los fija, y añadir
 * uno obliga a tocarla.
 */
const INTENTIONALLY_ANY_AUTHENTICATED = [
  'AuthGatewayController.requestPasswordChange',
  'AuthGatewayController.confirmPasswordChange',
  'AuthGatewayController.me',
  'CatalogController.list',
  'CatalogController.one',
].sort();

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return controllerFiles(full);
    return name.endsWith('.controller.ts') ? [full] : [];
  });
}

type Declaration = 'roles' | 'public' | 'any-authenticated' | 'none';

interface Handler {
  id: string;
  declaration: Declaration;
}

function metadataOf<T>(key: string, handler: object, controller: object): T | undefined {
  return (
    (Reflect.getMetadata(key, handler) as T | undefined) ??
    (Reflect.getMetadata(key, controller) as T | undefined)
  );
}

function collectHandlers(): Handler[] {
  const handlers: Handler[] = [];
  for (const file of controllerFiles(join(__dirname, '..', 'src'))) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const exported = require(file) as Record<string, unknown>;
    for (const candidate of Object.values(exported)) {
      if (typeof candidate !== 'function') continue;
      if (Reflect.getMetadata(PATH_METADATA, candidate) === undefined) continue;
      const controller = candidate as { name: string; prototype: Record<string, unknown> };
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = controller.prototype[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        if (Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;
        const roles = metadataOf<string[]>(ROLES_KEY, handler, controller) ?? [];
        const declaration: Declaration =
          roles.length > 0
            ? 'roles'
            : metadataOf<boolean>(IS_PUBLIC_KEY, handler, controller) === true
              ? 'public'
              : metadataOf<boolean>(ANY_AUTHENTICATED_KEY, handler, controller) === true
                ? 'any-authenticated'
                : 'none';
        handlers.push({ id: `${controller.name}.${name}`, declaration });
      }
    }
  }
  return handlers;
}

describe('Controladores del ERP: cada handler declara quién entra (TSK-ERPB-16)', () => {
  const handlers = collectHandlers();

  it('encuentra los handlers de la API', () => {
    expect(handlers.length).toBeGreaterThan(100);
  });

  it('ningún handler queda sin @Roles, @Public ni @AnyAuthenticated', () => {
    expect(handlers.filter((h) => h.declaration === 'none').map((h) => h.id)).toEqual([]);
  });

  it('los abiertos a cualquier sesión son exactamente los intencionales', () => {
    expect(
      handlers
        .filter((h) => h.declaration === 'any-authenticated')
        .map((h) => h.id)
        .sort(),
    ).toEqual(INTENTIONALLY_ANY_AUTHENTICATED);
  });
});

describe('RolesGuard deniega por defecto', () => {
  const logger = { debugContext: jest.fn(), warnContext: jest.fn() };
  const guard = new RolesGuard(new Reflector(), logger as unknown as PinoLoggerService);

  function contextFor(controller: new () => object, method: string): ExecutionContext {
    return {
      getHandler: () => controller.prototype[method as keyof object],
      getClass: () => controller,
      switchToHttp: () => ({ getRequest: () => ({ user: { sub: 'u1', roles: ['ACCOUNTANT'] } }) }),
    } as unknown as ExecutionContext;
  }

  class Undeclared {
    handler(): void {}
  }
  class Open {
    handler(): void {}
  }
  Reflect.defineMetadata(ANY_AUTHENTICATED_KEY, true, Open);
  class PublicRoute {
    handler(): void {}
  }
  Reflect.defineMetadata(IS_PUBLIC_KEY, true, PublicRoute.prototype.handler);

  it('un handler sin declaración responde 403', () => {
    expect(() => guard.canActivate(contextFor(Undeclared, 'handler'))).toThrow(ForbiddenException);
  });

  it('@AnyAuthenticated (de clase) deja pasar a cualquier sesión', () => {
    expect(guard.canActivate(contextFor(Open, 'handler'))).toBe(true);
  });

  it('@Public (de método) deja pasar', () => {
    expect(guard.canActivate(contextFor(PublicRoute, 'handler'))).toBe(true);
  });
});
