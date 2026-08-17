import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ContractHeaderModel, ContractTermModel } from '../../../../database/models';
import { AuthUser } from '../../../../common/types/auth-context.types';
import { LegalEntityAccessService } from '../../../../common/services/legal-entity-access.service';
import {
  CreateContractHeaderDto,
  CreateContractTermDto,
} from '../../shared/schemas/accounting.schemas';
import { BusinessPartnerRoleValidationService } from '../../business-partners/services/business-partner-role-validation.service';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

/**
 * Administra contratos que alimentan billing, AP, deuda e intercompany.
 */
@Injectable()
export class ContractsService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly businessPartnerRoleValidationService: BusinessPartnerRoleValidationService,
    private readonly legalEntityAccessService: LegalEntityAccessService,
    private readonly logger: PinoLoggerService,
    @InjectModel(ContractHeaderModel)
    private readonly contractHeaderModel: typeof ContractHeaderModel,
    @InjectModel(ContractTermModel) private readonly contractTermModel: typeof ContractTermModel,
  ) {}

  async list(user: AuthUser) {
    const rows = await this.contractHeaderModel.findAll({ order: [['createdAt', 'DESC']] });
    return {
      items: rows.filter((row) => {
        try {
          this.legalEntityAccessService.assertCanAccessLegalEntity(user, row.legalEntityId);
          return true;
        } catch {
          return false;
        }
      }),
      total: rows.length,
    };
  }

  async update(id: string, input: Record<string, unknown>, user: AuthUser) {
    const contract = await this.contractHeaderModel.findByPk(id);
    if (!contract)
      throw new NotFoundException({
        code: 'CONTRACT_NOT_FOUND',
        message: 'El contrato no existe.',
      });
    this.legalEntityAccessService.assertCanAccessLegalEntity(user, contract.legalEntityId);
    const allowed = [
      'contractNo',
      'contractType',
      'counterpartyBpId',
      'startDate',
      'endDate',
      'currencyCode',
      'status',
    ];
    const changes = Object.fromEntries(
      Object.entries(input).filter(([key]) => allowed.includes(key)),
    );
    await contract.update(changes);
    return contract;
  }

  async remove(id: string, user: AuthUser) {
    const contract = await this.contractHeaderModel.findByPk(id);
    if (!contract)
      throw new NotFoundException({
        code: 'CONTRACT_NOT_FOUND',
        message: 'El contrato no existe.',
      });
    this.legalEntityAccessService.assertCanAccessLegalEntity(user, contract.legalEntityId);
    await this.contractTermModel.destroy({ where: { contractId: id } });
    await contract.destroy();
    return { id, deleted: true };
  }

  create(input: CreateContractHeaderDto, user: AuthUser) {
    this.logger.info('Creando contrato.', {
      layer: 'service',
      module: 'contracts',
      action: 'create',
      contractNo: input.contractNo,
      contractType: input.contractType,
      legalEntityId: input.legalEntityId,
      userId: user.sub,
    });
    return this.sequelize.transaction(async (transaction) => {
      this.legalEntityAccessService.assertCanAccessLegalEntity(user, input.legalEntityId);
      this.assertContractDatesAreValid(input.startDate, input.endDate);
      await this.businessPartnerRoleValidationService.assertHasAnyActiveRole(
        input.counterpartyBpId,
        this.rolesForContractType(input.contractType),
        input.legalEntityId,
        transaction,
      );

      const contract = await this.contractHeaderModel.create(input, { transaction });
      this.logger.info('Contrato creado.', {
        layer: 'service',
        module: 'contracts',
        action: 'create',
        contractId: contract.id,
        contractNo: contract.contractNo,
      });
      return contract;
    });
  }

  addTerm(input: CreateContractTermDto, user: AuthUser) {
    this.logger.info('Agregando término contractual.', {
      layer: 'service',
      module: 'contracts',
      action: 'addTerm',
      contractId: input.contractId,
      termCode: input.termCode,
      userId: user.sub,
    });
    return this.sequelize.transaction(async (transaction) => {
      this.assertContractDatesAreValid(input.effectiveFrom, input.effectiveTo);
      const contract = await this.contractHeaderModel.findByPk(input.contractId, { transaction });
      if (!contract) {
        throw new NotFoundException({
          code: 'CONTRACT_NOT_FOUND',
          message: 'El contrato informado no existe.',
        });
      }
      this.legalEntityAccessService.assertCanAccessLegalEntity(user, contract.legalEntityId);
      const term = await this.contractTermModel.create(input, { transaction });
      this.logger.info('Término contractual creado.', {
        layer: 'service',
        module: 'contracts',
        action: 'addTerm',
        contractTermId: term.id,
        contractId: input.contractId,
      });
      return term;
    });
  }

  private rolesForContractType(contractType: CreateContractHeaderDto['contractType']): string[] {
    switch (contractType) {
      case 'CUSTOMER_BILLING':
        return ['CUSTOMER'];
      case 'SUPPLIER':
        return ['SUPPLIER'];
      case 'LOAN':
        return ['LENDER', 'BANK'];
      case 'INTERCOMPANY':
        return ['INTERCOMPANY'];
      case 'MERCHANT':
        return ['MERCHANT'];
      default:
        return [];
    }
  }

  private assertContractDatesAreValid(startDate: Date, endDate: Date | undefined): void {
    if (endDate && endDate < startDate) {
      throw new BadRequestException({
        code: 'INVALID_CONTRACT_DATE_RANGE',
        message: 'La fecha final del contrato no puede ser anterior a la fecha inicial.',
      });
    }
  }
}
