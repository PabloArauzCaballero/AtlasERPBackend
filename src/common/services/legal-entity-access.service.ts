import { ForbiddenException, Injectable } from '@nestjs/common';
import { PinoLoggerService } from '../logger/pino-logger.service';
import { AuthUser } from '../types/auth-context.types';

/**
 * Aplica autorización por entidad legal, equivalente práctico a company-code authorization.
 *
 * La regla es estricta: solo `admin` puede operar todas las entidades por defecto. Los demás
 * roles necesitan que el JWT incluya `legalEntityIds` con el UUID de la entidad permitida.
 */
@Injectable()
export class LegalEntityAccessService {
  private readonly activeLogger: PinoLoggerService;

  constructor(logger?: PinoLoggerService) {
    this.activeLogger = logger ?? new PinoLoggerService();
  }

  assertCanAccessLegalEntity(user: AuthUser, legalEntityId: string): void {
    if (this.hasRole(user, 'admin')) {
      this.activeLogger.debug('Acceso a entidad legal permitido para admin.', {
        layer: 'service',
        service: 'LegalEntityAccessService',
        action: 'assertCanAccessLegalEntity',
        userId: user.sub,
        role: user.role,
        legalEntityId,
      });
      return;
    }

    if (!user.legalEntityIds || user.legalEntityIds.length === 0) {
      this.activeLogger.warn('Acceso a entidad legal rechazado por ausencia de alcance en JWT.', {
        layer: 'service',
        service: 'LegalEntityAccessService',
        action: 'assertCanAccessLegalEntity',
        userId: user.sub,
        role: user.role,
        legalEntityId,
      });
      throw new ForbiddenException({
        code: 'LEGAL_ENTITY_SCOPE_REQUIRED',
        message: 'El token no incluye entidades legales autorizadas para esta operación.',
      });
    }

    if (!user.legalEntityIds.includes(legalEntityId)) {
      this.activeLogger.warn('Acceso a entidad legal rechazado por entidad fuera de alcance.', {
        layer: 'service',
        service: 'LegalEntityAccessService',
        action: 'assertCanAccessLegalEntity',
        userId: user.sub,
        role: user.role,
        legalEntityId,
        allowedLegalEntityCount: user.legalEntityIds.length,
      });
      throw new ForbiddenException({
        code: 'LEGAL_ENTITY_FORBIDDEN',
        message: 'No tienes permiso para operar la entidad legal solicitada.',
      });
    }

    this.activeLogger.debug('Acceso a entidad legal autorizado.', {
      layer: 'service',
      service: 'LegalEntityAccessService',
      action: 'assertCanAccessLegalEntity',
      userId: user.sub,
      role: user.role,
      legalEntityId,
    });
  }

  /**
   * Las entidades que el usuario puede VER en un listado: `null` significa todas (ADMIN), una lista
   * vacía significa ninguna. Es la misma regla que `assertCanAccessLegalEntity`, pero para filtrar
   * en la consulta en vez de lanzar: un listado de maestros no debe fallar entero porque exista
   * otra entidad, debe no mostrarla (P-13).
   */
  accessibleLegalEntityIds(user: AuthUser): readonly string[] | null {
    if (this.hasRole(user, 'admin')) return null;
    return user.legalEntityIds ?? [];
  }

  /** Versión booleana, sin registro, para filtrar filas ya leídas. */
  canAccessLegalEntity(user: AuthUser, legalEntityId: string): boolean {
    const allowed = this.accessibleLegalEntityIds(user);
    return allowed === null || allowed.includes(legalEntityId);
  }

  private hasRole(user: AuthUser, expectedRole: string): boolean {
    const expected = expectedRole.trim().toUpperCase();
    return [user.roleCode, user.role, ...(user.roles ?? [])]
      .map((role) => role?.trim().toUpperCase())
      .some((role) => role === expected);
  }
}
