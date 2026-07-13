import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { env } from '../../config/env';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PinoLoggerService } from '../logging/pino-logger.service';
import type { AuthUser, RequestWithAuthUser } from '../types/auth-context.types';

interface JwtPayload {
  sub?: string;
  roleCode?: string;
  role?: string;
  roles?: string[];
  email?: string;
  legalEntityIds?: string[];
  legal_entity_ids?: string[];
  tokenType?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly accessJwtService = new JwtService({ secret: env.JWT_ACCESS_SECRET });
  private readonly internalJwtService = new JwtService({ secret: env.JWT_INTERNAL_SECRET });

  constructor(
    private readonly reflector: Reflector,
    private readonly logger: PinoLoggerService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<RequestWithAuthUser>();

    if (isPublic) {
      this.logger.debugContext(JwtAuthGuard.name, 'Public endpoint bypassed JWT guard', {
        path: request.url,
        method: request.method,
      });
      return true;
    }

    if (env.AUTH_DISABLED_FOR_LOCAL_TESTING) {
      request.user = this.buildLocalTestingUser();
      this.logger.warnContext(JwtAuthGuard.name, 'JWT guard bypassed by local testing env flag', {
        path: request.url,
        method: request.method,
        userId: request.user.sub,
        roles: request.user.roles,
      });
      return true;
    }

    const token = this.extractBearerToken(request.headers.authorization);

    try {
      const payload = this.verifyToken(token);
      request.user = this.toAuthUser(payload);
      this.logger.debugContext(JwtAuthGuard.name, 'JWT token accepted', {
        userId: request.user.sub,
        roles: this.extractComparableRoles(request.user),
        path: request.url,
        method: request.method,
      });
      return true;
    } catch (error) {
      this.logger.warnContext(JwtAuthGuard.name, 'JWT token rejected', {
        path: request.url,
        method: request.method,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      throw new UnauthorizedException('Token inválido o expirado.');
    }
  }

  private buildLocalTestingUser(): AuthUser {
    const primaryRole = env.AUTH_DISABLED_ROLES[0] ?? 'ADMIN';

    return {
      sub: env.AUTH_DISABLED_USER_ID,
      roleCode: primaryRole,
      role: primaryRole,
      roles: env.AUTH_DISABLED_ROLES,
      email: env.AUTH_DISABLED_USER_EMAIL,
      tokenType: 'local-testing-bypass',
    };
  }

  private extractBearerToken(header: string | string[] | undefined): string {
    const value = Array.isArray(header) ? header[0] : header;

    if (!value) {
      throw new UnauthorizedException('Token no enviado.');
    }

    const [scheme, token, unexpected] = value.split(' ');

    if (scheme !== 'Bearer' || !token || unexpected || token.split('.').length !== 3) {
      throw new UnauthorizedException('Formato de Authorization inválido.');
    }

    return token;
  }

  private verifyToken(token: string): JwtPayload {
    try {
      return this.accessJwtService.verify<JwtPayload>(token, { secret: env.JWT_ACCESS_SECRET });
    } catch (accessTokenError) {
      try {
        return this.internalJwtService.verify<JwtPayload>(token, {
          secret: env.JWT_INTERNAL_SECRET,
          issuer: env.JWT_INTERNAL_ISSUER,
          audience: env.JWT_INTERNAL_AUDIENCE,
        });
      } catch {
        throw accessTokenError;
      }
    }
  }

  private toAuthUser(payload: JwtPayload): AuthUser {
    if (!payload.sub) {
      throw new UnauthorizedException('Payload JWT inválido.');
    }

    const roles = this.normalizeRoles(payload);
    if (roles.length === 0) {
      throw new UnauthorizedException('Payload JWT sin rol válido.');
    }

    const legalEntityIds = payload.legalEntityIds ?? payload.legal_entity_ids;
    if (legalEntityIds && !Array.isArray(legalEntityIds)) {
      throw new UnauthorizedException('Payload JWT con entidades legales inválidas.');
    }

    const primaryRole = roles[0];
    if (!primaryRole) {
      throw new UnauthorizedException('Payload JWT sin rol válido.');
    }

    return {
      sub: payload.sub,
      roleCode: payload.roleCode ?? payload.role ?? primaryRole,
      role: payload.role ?? payload.roleCode ?? primaryRole,
      roles,
      ...(payload.email ? { email: payload.email } : {}),
      ...(legalEntityIds ? { legalEntityIds } : {}),
      ...(payload.tokenType ? { tokenType: payload.tokenType } : {}),
    };
  }

  private normalizeRoles(payload: JwtPayload): string[] {
    const roles = payload.roles ?? [payload.roleCode, payload.role].filter(Boolean);
    return [
      ...new Set(roles.map((role) => role?.trim()).filter((role): role is string => Boolean(role))),
    ];
  }

  private extractComparableRoles(user: AuthUser): string[] {
    return [user.roleCode, user.role, ...(user.roles ?? [])]
      .map((role) => role?.trim())
      .filter((role): role is string => Boolean(role));
  }
}
