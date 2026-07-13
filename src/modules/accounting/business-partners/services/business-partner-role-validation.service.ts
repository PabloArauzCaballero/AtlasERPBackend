import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import { BusinessPartnerModel, BusinessPartnerRoleModel } from '../../../../database/models';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

/**
 * Valida que el Business Partner tenga el rol operativo requerido antes de usarlo.
 *
 * El patrón replica el BP central de SAP: una contraparte existe una sola vez, pero solo puede
 * participar en procesos para los que tiene rol activo dentro de la entidad legal correspondiente.
 */
@Injectable()
export class BusinessPartnerRoleValidationService {
  constructor(
    private readonly logger: PinoLoggerService,
    @InjectModel(BusinessPartnerModel)
    private readonly businessPartnerModel: typeof BusinessPartnerModel,
    @InjectModel(BusinessPartnerRoleModel)
    private readonly businessPartnerRoleModel: typeof BusinessPartnerRoleModel,
  ) {}

  /**
   * Verifica existencia, estado activo y rol activo del BP.
   *
   * @param businessPartnerId - Identificador del Business Partner.
   * @param expectedRoles - Roles aceptados para el proceso actual.
   * @param legalEntityId - Entidad legal del proceso, si aplica.
   * @param transaction - Transacción del caso de uso.
   */
  async assertHasAnyActiveRole(
    businessPartnerId: string,
    expectedRoles: string[],
    legalEntityId: string | undefined,
    transaction: Transaction,
  ): Promise<void> {
    this.logger.debug('Validando rol activo de Business Partner.', {
      layer: 'service',
      module: 'business-partners',
      service: 'BusinessPartnerRoleValidationService',
      action: 'assertHasAnyActiveRole',
      businessPartnerId,
      expectedRoles,
      legalEntityId,
    });
    const partner = await this.businessPartnerModel.findByPk(businessPartnerId, { transaction });

    if (!partner) {
      throw new NotFoundException({
        code: 'BUSINESS_PARTNER_NOT_FOUND',
        message: 'La contraparte no existe.',
      });
    }

    if (partner.status !== 'ACTIVE') {
      throw new ConflictException({
        code: 'BUSINESS_PARTNER_NOT_ACTIVE',
        message: 'La contraparte no está activa.',
      });
    }

    const roles = await this.businessPartnerRoleModel.findAll({
      where: { businessPartnerId, status: 'ACTIVE' },
      transaction,
    });

    const hasAllowedRole = roles.some((role) => {
      const roleMatches = expectedRoles.includes(role.roleCode);
      const entityMatches =
        !legalEntityId || !role.legalEntityId || role.legalEntityId === legalEntityId;
      const today = new Date().toISOString().slice(0, 10);
      const startsInPast = this.toDateOnly(role.effectiveFrom) <= today;
      const hasNotExpired = !role.effectiveTo || this.toDateOnly(role.effectiveTo) >= today;
      return roleMatches && entityMatches && startsInPast && hasNotExpired;
    });

    if (!hasAllowedRole) {
      this.logger.warn('Business Partner sin rol compatible.', {
        layer: 'service',
        module: 'business-partners',
        service: 'BusinessPartnerRoleValidationService',
        action: 'assertHasAnyActiveRole',
        businessPartnerId,
        expectedRoles,
        legalEntityId,
      });
      throw new ConflictException({
        code: 'BUSINESS_PARTNER_ROLE_MISSING',
        message: 'La contraparte no tiene un rol activo compatible con esta operación.',
        details: { businessPartnerId, expectedRoles, legalEntityId },
      });
    }

    this.logger.debug('Business Partner con rol compatible validado.', {
      layer: 'service',
      module: 'business-partners',
      service: 'BusinessPartnerRoleValidationService',
      action: 'assertHasAnyActiveRole',
      businessPartnerId,
      expectedRoles,
      legalEntityId,
    });
  }

  private toDateOnly(value: Date | string): string {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return value.slice(0, 10);
  }
}
