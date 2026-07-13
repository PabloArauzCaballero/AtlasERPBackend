import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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
      this.logger.debugContext(RolesGuard.name, 'Endpoint without explicit role requirement', {
        handler: context.getHandler().name,
      });
      return true;
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
