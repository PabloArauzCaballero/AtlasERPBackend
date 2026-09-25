import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ANY_AUTHENTICATED_KEY } from '../decorators/any-authenticated.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PinoLoggerService } from '../logging/pino-logger.service';
import type { AuthUser, RequestWithAuthUser } from '../types/auth-context.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly logger: PinoLoggerService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      /*
       * Deniega por defecto (TSK-ERPB-16). Antes un handler sin `@Roles` quedaba abierto a
       * cualquier sesión, y así se colaron lecturas de Ads y de contratos. Ahora pasar sin rol
       * exige decirlo: `@Public()` o `@AnyAuthenticated()`. `test/controllers-roles-coverage.spec.ts`
       * recorre los controladores y falla si alguno no declara ninguna de las tres cosas.
       */
      const targets = [context.getHandler(), context.getClass()];
      const explicitlyOpen =
        this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets) === true ||
        this.reflector.getAllAndOverride<boolean>(ANY_AUTHENTICATED_KEY, targets) === true;
      if (explicitlyOpen) {
        this.logger.debugContext(RolesGuard.name, 'Endpoint explicitly open to any session', {
          handler: context.getHandler().name,
        });
        return true;
      }
      this.logger.warnContext(RolesGuard.name, 'Endpoint without role declaration denied', {
        handler: context.getHandler().name,
      });
      throw new ForbiddenException('No tienes permisos para ejecutar esta operación.');
    }

    const request = context.switchToHttp().getRequest<RequestWithAuthUser>();
    const userRoles = this.extractUserRoles(request.user);
    const normalizedUserRoleSet = new Set(userRoles.map((role) => this.normalizeRole(role)));
    const isAllowed = requiredRoles.some((role) =>
      normalizedUserRoleSet.has(this.normalizeRole(role)),
    );

    if (!isAllowed) {
      this.logger.warnContext(RolesGuard.name, 'Role authorization denied', {
        requiredRoles,
        userRoles,
        handler: context.getHandler().name,
      });
      throw new ForbiddenException('No tienes permisos para ejecutar esta operación.');
    }

    this.logger.debugContext(RolesGuard.name, 'Role authorization accepted', {
      requiredRoles,
      userRoles,
      handler: context.getHandler().name,
    });

    return true;
  }

  private extractUserRoles(user: AuthUser | undefined): string[] {
    if (!user) {
      return [];
    }

    return [user.roleCode, user.role, ...(user.roles ?? [])]
      .map((role) => role?.trim())
      .filter((role): role is string => Boolean(role));
  }

  private normalizeRole(role: string): string {
    return role.trim().toUpperCase();
  }
}
