import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { env } from '../../config/env';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PinoLoggerService } from '../logging/pino-logger.service';
import { redactUrlQuery } from '../logging/redact-url';
import type { AuthUser, RequestWithAuthUser } from '../types/auth-context.types';

interface JwtPayload {
  sub?: string;
  atlasUserId?: string;
  roleCode?: string;
  role?: string;
  roles?: string[];
  email?: string;
  legalEntityIds?: string[];
  legal_entity_ids?: string[];
  tokenType?: string;
}

/** Único vocabulario de roles que puede traer un token del plano interno (servicio a servicio). */
const SERVICE_PLANE_ROLE_PREFIX = 'ADS_';

/** Si la peticion trae credencial, se la respeta: el bypass local es para las que no la traen. */
function hasAuthorizationHeader(header: string | string[] | undefined): boolean {
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === 'string' && value.trim().length > 0;
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
        path: redactUrlQuery(request.url),
        method: request.method,
      });
      return true;
    }

    /*
     * El bypass local cubre las peticiones SIN token, nunca las que traen uno.
     *
     * Es lo que siempre dijo `docker-compose.authoff.yml` —«esto solo cubre las peticiones sin
     * token; el login real sigue funcionando»— pero no lo que hacia el codigo: se fabricaba un
     * ADMIN antes de mirar la cabecera, asi que la sesion que el navegador acababa de abrir se
     * descartaba en cada peticion.
     *
     * El sintoma vivia en el portal del comercio. Un comercio entraba con su usuario, el backend
     * lo veia como staff interno —ADMIN esta en `PORTAL_INTERNAL_ROLES`— y `GET /portal/scope`
     * respondia «hay que elegir sobre que comercio operar», asi que Planes, Facturacion, Campanas
     * y Sucursales le pintaban un desplegable con TODOS los comercios de la plataforma. El
     * comercio no elige comercio: es el que esta logueado.
     *
     * Un token presente pero invalido o caducado se rechaza como en cualquier otro entorno: en
     * dev eso devuelve al login, que es exactamente lo que hay que hacer, y no volver a
     * convertir en ADMIN a quien traia una sesion.
     */
    if (
      env.AUTH_DISABLED_FOR_LOCAL_TESTING &&
      !hasAuthorizationHeader(request.headers.authorization)
    ) {
      request.user = this.buildLocalTestingUser();
      this.logger.warnContext(JwtAuthGuard.name, 'JWT guard bypassed by local testing env flag', {
        path: redactUrlQuery(request.url),
        method: request.method,
        userId: request.user.sub,
        roles: request.user.roles,
      });
      return true;
    }

    const token = this.extractBearerToken(request.headers.authorization);

    try {
      const { payload, plane } = this.verifyToken(token);
      request.user = this.toAuthUser(payload);
      if (plane === 'internal') this.assertServicePlaneRoles(request.user);
      this.logger.debugContext(JwtAuthGuard.name, 'JWT token accepted', {
        userId: request.user.sub,
        roles: this.extractComparableRoles(request.user),
        path: redactUrlQuery(request.url),
        method: request.method,
      });
      return true;
    } catch (error) {
      this.logger.warnContext(JwtAuthGuard.name, 'JWT token rejected', {
        path: redactUrlQuery(request.url),
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

  /**
   * Dos planos de credencial, cada uno con su llave y su par emisor/audiencia.
   *
   * La ruta de acceso verificaba sólo la firma: ni algoritmo, ni emisor, ni audiencia. Como
   * `JWT_INTERNAL_SECRET` caía por omisión a `JWT_ACCESS_SECRET` (corregido en
   * `config/env.ts`), un token de servicio pasaba por aquí y se convertía en la sesión de
   * un usuario, con el `sub` y los roles que ese token declarase.
   *
   * `algorithms` se fija aunque hoy la llave sea simétrica y `jsonwebtoken` ya restrinja a
   * HS* por el tipo de secreto: el día que alguien migre a una llave asimétrica, el
   * comportamiento por omisión deja de ser el seguro y este parámetro es lo que evita que
   * el cambio pase inadvertido.
   */
  private verifyToken(token: string): { payload: JwtPayload; plane: 'access' | 'internal' } {
    try {
      const payload = this.accessJwtService.verify<JwtPayload>(token, {
        secret: env.JWT_ACCESS_SECRET,
        algorithms: ['HS256'],
        issuer: env.JWT_ACCESS_ISSUER,
        audience: env.JWT_ACCESS_AUDIENCE,
      });
      return { payload, plane: 'access' };
    } catch (accessTokenError) {
      try {
        const payload = this.internalJwtService.verify<JwtPayload>(token, {
          secret: env.JWT_INTERNAL_SECRET,
          algorithms: ['HS256'],
          issuer: env.JWT_INTERNAL_ISSUER,
          audience: env.JWT_INTERNAL_AUDIENCE,
        });
        return { payload, plane: 'internal' };
      } catch {
        throw accessTokenError;
      }
    }
  }

  /**
   * El plano interno es el de los clientes TÉCNICOS (servidor de anuncios, rastreador de eventos) y
   * su vocabulario es el de ads (`docs/architecture/architecture.md`, «Roles incluidos»). Pero el
   * guard aceptaba cualquier rol que el token declarase: quien tuviera `JWT_INTERNAL_SECRET` —un
   * servicio— se firmaba `ADMIN` o `FINANCE` y operaba la contabilidad y el portal como una
   * persona (P-13). Un token de servicio con un rol fuera de `ADS_*` se rechaza entero, no se
   * recorta: un emisor que pide lo que no le toca está mal configurado y tiene que verse.
   */
  private assertServicePlaneRoles(user: AuthUser): void {
    const roles = this.extractComparableRoles(user).map((role) => role.toUpperCase());
    if (roles.every((role) => role.startsWith(SERVICE_PLANE_ROLE_PREFIX))) return;
    throw new UnauthorizedException('Token de servicio con roles fuera de su plano.');
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
      ...(payload.atlasUserId ? { atlasUserId: payload.atlasUserId } : {}),
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
