import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, Transaction, col, fn, where as sequelizeWhere } from 'sequelize';
import { MerchantUserModel } from '../b2b-sales-crm/models/b2b-sales-crm.models';
import { AdvertiserAccountModel, AdvertiserUserModel } from '../ads/models';
import { PinoLoggerService } from '../../common/logging/pino-logger.service';
import type { AuthUser } from '../../common/types/auth-context.types';
import { PORTAL_ACTIVE_MEMBERSHIP_STATUSES, PORTAL_INTERNAL_ROLES } from './portal.constants';

/**
 * El `sub` del token es un identificador OPACO del proveedor de identidad: hoy AtlasBackend emite
 * bigints ("1", "27"), y las fixtures locales usan UUID. Este backend no debe presuponer el
 * formato; sólo exige que venga algo y que no sea espacio en blanco.
 *
 * Antes se filtraba por un patrón UUID, y como los identificadores reales no lo cumplen, el enlace
 * por identidad estable no se intentaba nunca: todo el alcance del portal se resolvía por el correo
 * —el enlace de respaldo—, sin que nada lo delatara porque respondía igual.
 */
function isUsableIdentityReference(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Alcance efectivo de un llamador del portal, resuelto contra la base y no contra el JWT. */
export interface PortalScope {
  /** Staff interno operando en nombre de un comercio (soporte/onboarding). */
  readonly isInternalOperator: boolean;
  /** Cuentas B2B a las que pertenece el usuario partner. Vacío para staff interno. */
  readonly accountIds: readonly string[];
  readonly userId: string;
  readonly email: string | null;
  readonly roles: readonly string[];
}

/**
 * Autorización por tenant del portal del comercio.
 *
 * Ningún identificador de cuenta, anunciante o campaña recibido del cliente se usa sin pasar por
 * aquí. La resolución es fail-closed: si un usuario partner no tiene membresía activa en
 * `atlas_sales.merchant_users`, no accede a nada, aunque su JWT traiga el rol `MERCHANT_ADMIN`.
 */
@Injectable()
export class PortalScopeService {
  constructor(
    @InjectModel(MerchantUserModel) private readonly merchantUserModel: typeof MerchantUserModel,
    @InjectModel(AdvertiserAccountModel)
    private readonly advertiserModel: typeof AdvertiserAccountModel,
    @InjectModel(AdvertiserUserModel)
    private readonly advertiserUserModel: typeof AdvertiserUserModel,
    private readonly logger: PinoLoggerService,
  ) {}

  /** Resuelve el alcance del llamador consultando sus membresías reales. */
  async resolveScope(user: AuthUser): Promise<PortalScope> {
    const roles = this.extractRoles(user);
    const isInternalOperator = roles.some((role) =>
      (PORTAL_INTERNAL_ROLES as readonly string[]).includes(role),
    );
    const email = this.normalizeEmail(user.email);

    if (isInternalOperator) {
      return { isInternalOperator: true, accountIds: [], userId: user.sub, email, roles };
    }

    const accountIds = await this.findMembershipAccountIds(user.sub, email);

    if (accountIds.length === 0) {
      this.logger.warnContext(
        PortalScopeService.name,
        'Acceso al portal denegado: usuario sin membresía de comercio activa',
        { userId: user.sub, roles },
      );
      throw new ForbiddenException({
        code: 'PORTAL_SCOPE_NOT_PROVISIONED',
        message: 'Tu usuario no está asociado a ningún comercio activo.',
      });
    }

    return { isInternalOperator: false, accountIds, userId: user.sub, email, roles };
  }

  /**
   * Determina la cuenta sobre la que se ejecuta la operación.
   *
   * - Staff interno: debe indicarla explícitamente; el acceso delegado queda registrado.
   * - Comercio: solo puede usar una de sus cuentas. Si no la indica y tiene exactamente una,
   *   se infiere; con varias debe elegir.
   */
  resolveAccountId(scope: PortalScope, requestedAccountId?: string): string {
    if (scope.isInternalOperator) {
      if (!requestedAccountId) {
        throw new BadRequestException({
          code: 'MERCHANT_ACCOUNT_REQUIRED',
          message: 'Indica la cuenta de comercio sobre la que quieres operar.',
        });
      }
      this.logger.infoContext(PortalScopeService.name, 'Acceso delegado de staff interno', {
        userId: scope.userId,
        roles: scope.roles,
        merchantAccountId: requestedAccountId,
      });
      return requestedAccountId;
    }

    if (!requestedAccountId) {
      if (scope.accountIds.length === 1) return scope.accountIds[0] as string;
      throw new BadRequestException({
        code: 'MERCHANT_ACCOUNT_REQUIRED',
        message: 'Tu usuario opera varios comercios: indica cuál quieres consultar.',
      });
    }

    this.assertAccountAccess(scope, requestedAccountId);
    return requestedAccountId;
  }

  /** Falla con 403 si la cuenta no pertenece al alcance del usuario partner. */
  assertAccountAccess(scope: PortalScope, accountId: string): void {
    if (scope.isInternalOperator) return;
    if (scope.accountIds.includes(accountId)) return;

    this.logger.warnContext(
      PortalScopeService.name,
      'Acceso denegado a cuenta de comercio fuera de alcance',
      { userId: scope.userId, merchantAccountId: accountId, scopeSize: scope.accountIds.length },
    );
    throw new ForbiddenException({
      code: 'MERCHANT_ACCOUNT_FORBIDDEN',
      message: 'No tienes permiso para operar esta cuenta de comercio.',
    });
  }

  /**
   * Anunciantes visibles para el llamador.
   * Devuelve `null` cuando no hay restricción (staff interno sin cuenta indicada).
   */
  async resolveAccessibleAdvertiserIds(
    scope: PortalScope,
    merchantAccountId?: string,
  ): Promise<string[] | null> {
    if (scope.isInternalOperator && !merchantAccountId) return null;

    const accountIds = merchantAccountId ? [merchantAccountId] : [...scope.accountIds];
    if (!scope.isInternalOperator && merchantAccountId) {
      this.assertAccountAccess(scope, merchantAccountId);
    }

    const ownedByAccount = await this.advertiserModel.findAll({
      attributes: ['id'],
      where: { merchantAccountId: { [Op.in]: accountIds } },
    });

    const advertiserIds = new Set(ownedByAccount.map((row) => row.id));

    // Vínculo directo del usuario con el anunciante (`ad_advertiser_users`), que existe para
    // anunciantes dados de alta por el equipo comercial antes de enlazarlos a la cuenta B2B.
    if (!scope.isInternalOperator) {
      for (const membership of await this.findAdvertiserMemberships(scope)) {
        advertiserIds.add(membership.advertiserId);
      }
    }

    return [...advertiserIds];
  }

  /** Falla con 403/404 si el anunciante no pertenece al alcance del llamador. */
  async assertAdvertiserAccess(
    scope: PortalScope,
    advertiserId: string,
    transaction?: Transaction,
  ): Promise<void> {
    if (scope.isInternalOperator) return;

    const advertiser = await this.advertiserModel.findByPk(advertiserId, {
      attributes: ['id', 'merchantAccountId'],
      transaction,
    });

    const belongsToAccount = Boolean(
      advertiser?.merchantAccountId && scope.accountIds.includes(advertiser.merchantAccountId),
    );

    if (belongsToAccount) return;

    const memberships = await this.findAdvertiserMemberships(scope, transaction);
    if (memberships.some((membership) => membership.advertiserId === advertiserId)) return;

    this.logger.warnContext(
      PortalScopeService.name,
      'Acceso denegado a anunciante fuera de alcance',
      { userId: scope.userId, advertiserId, scopeSize: scope.accountIds.length },
    );
    // Mismo código y mensaje exista o no el anunciante: no se filtra su existencia.
    throw new ForbiddenException({
      code: 'ADVERTISER_FORBIDDEN',
      message: 'No tienes permiso para operar este anunciante.',
    });
  }

  private async findMembershipAccountIds(
    userId: string,
    normalizedEmail: string | null,
  ): Promise<string[]> {
    const identityClauses: Record<string, unknown>[] = [];
    if (isUsableIdentityReference(userId)) identityClauses.push({ userId: userId.trim() });
    if (normalizedEmail) identityClauses.push({ emailNormalized: normalizedEmail });
    if (identityClauses.length === 0) return [];

    const memberships = await this.merchantUserModel.findAll({
      attributes: ['accountId'],
      where: {
        status: { [Op.in]: [...PORTAL_ACTIVE_MEMBERSHIP_STATUSES] },
        [Op.or]: identityClauses,
      },
    });

    return [...new Set(memberships.map((membership) => membership.accountId))];
  }

  private async findAdvertiserMemberships(
    scope: PortalScope,
    transaction?: Transaction,
  ): Promise<AdvertiserUserModel[]> {
    const identityClauses: unknown[] = [];
    if (isUsableIdentityReference(scope.userId)) identityClauses.push({ userId: scope.userId.trim() });
    if (scope.email) {
      identityClauses.push(sequelizeWhere(fn('lower', fn('btrim', col('email'))), scope.email));
    }
    if (identityClauses.length === 0) return [];

    return this.advertiserUserModel.findAll({
      attributes: ['advertiserId'],
      where: {
        status: 'ACTIVE',
        [Op.or]: identityClauses,
      } as never,
      transaction,
    });
  }

  private normalizeEmail(email: string | undefined): string | null {
    const normalized = email?.trim().toLowerCase();
    return normalized ? normalized : null;
  }

  private extractRoles(user: AuthUser): string[] {
    return [
      ...new Set(
        [user.roleCode, user.role, ...(user.roles ?? [])]
          .map((role) => role?.trim().toUpperCase())
          .filter((role): role is string => Boolean(role)),
      ),
    ];
  }
}
