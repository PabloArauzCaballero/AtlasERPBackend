import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Op, WhereOptions } from 'sequelize';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import {
  ContractStatus,
  ContractVersionStatus,
  OpportunityStage,
  ProposalStatus,
} from '../b2b-sales-crm.enums';
import type {
  CreateContractFromProposalDto,
  CreateMdrRuleDto,
  SignContractDto,
  UpdateMdrRuleDto,
} from '../b2b-sales-crm.dtos';
import { toContractVersionResponse } from '../b2b-sales-crm.mapper';
import { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';
import { B2BSalesCrmUseCaseBase } from './b2b-sales-crm-use-case.base';

@Injectable()
export class B2BContractsService extends B2BSalesCrmUseCaseBase {
  constructor(repository: B2BSalesCrmRepository, logger: PinoLoggerService) {
    super(repository, logger);
  }

  async createContractFromProposal(
    input: CreateContractFromProposalDto,
  ): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BContractsService.name, 'B2B CRM use case started', {
      useCase: 'createContractFromProposal',
    });
    return this.repository.transaction(async (transaction) => {
      const proposal = await this.repository.findProposalWithLines(input.proposalId, transaction);

      if (!proposal) {
        throw new NotFoundException('Propuesta no encontrada.');
      }

      if (proposal.status !== ProposalStatus.ACCEPTED) {
        throw new ConflictException('Solo una propuesta aceptada puede convertirse en contrato.');
      }

      const existingContract = await this.repository.contracts.findOne({
        where: {
          opportunityId: proposal.opportunityId,
          status: { [Op.ne]: ContractStatus.TERMINATED },
        },
        transaction,
      });

      if (existingContract) {
        throw new ConflictException('La oportunidad ya tiene un contrato asociado.');
      }

      const contract = await this.repository.contracts.create(
        {
          accountId: proposal.accountId,
          opportunityId: proposal.opportunityId,
          contractNumber: input.contractNumber,
          status: ContractStatus.PENDING_SIGNATURE,
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          billingCycle: input.billingCycle,
          settlementPolicy: input.settlementPolicy,
        },
        { transaction },
      );

      const version = await this.repository.contractVersions.create(
        {
          contractId: contract.id,
          versionNumber: 1,
          validFrom: input.startDate,
          validTo: input.endDate ?? null,
          status: ContractVersionStatus.DRAFT,
          documentUrl: input.documentUrl ?? null,
        },
        { transaction },
      );

      for (const line of proposal.lines ?? []) {
        await this.repository.commercialTerms.create(
          {
            contractVersionId: version.id,
            termType: line.termType,
            description: line.description,
            ratePercent: line.ratePercent,
            fixedAmount: line.fixedAmount,
            currency: line.currency,
            billingTiming: line.billingTiming,
          },
          { transaction },
        );
      }

      await this.repository.opportunities.update(
        { stage: OpportunityStage.CLOSED_WON, updatedAt: new Date() },
        { where: { id: proposal.opportunityId }, transaction },
      );

      return {
        contract: {
          id: contract.id,
          accountId: contract.accountId,
          contractNumber: contract.contractNumber,
          status: contract.status,
          startDate: contract.startDate,
          endDate: contract.endDate,
        },
        version: toContractVersionResponse(version),
      };
    });
  }

  async signAndActivateContract(
    contractId: string,
    input: SignContractDto,
  ): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BContractsService.name, 'B2B CRM use case started', {
      useCase: 'signAndActivateContract',
    });
    return this.repository.transaction(async (transaction) => {
      const contract = await this.repository.contracts.findByPk(contractId, { transaction });

      if (!contract) {
        throw new NotFoundException('Contrato no encontrado.');
      }

      const version = await this.repository.contractVersions.findOne({
        where: { contractId, versionNumber: 1 },
        transaction,
      });

      if (!version) {
        throw new ConflictException('El contrato no tiene versión contractual inicial.');
      }

      await contract.update(
        { status: ContractStatus.ACTIVE, signedAt: input.signedAt ?? new Date() },
        { transaction },
      );
      await version.update(
        {
          status: ContractVersionStatus.ACTIVE,
          approvedByUserId: input.approvedByUserId,
          approvedAt: new Date(),
        },
        { transaction },
      );

      return {
        contractId: contract.id,
        status: contract.status,
        version: toContractVersionResponse(version),
      };
    });
  }
  /**
   * Las reglas de comision de una version contractual, ordenadas de la mas especifica a la general.
   *
   * Ese orden no es cosmetico: es EL orden en que el motor las elige. Enseñarlas al reves dejaria
   * creer que una regla general anula a una segmentada, que es exactamente lo contrario de lo que
   * pasa cuando llega la venta.
   */
  async listMdrRules(contractVersionId?: string): Promise<Record<string, unknown>[]> {
    this.logger.infoContext(B2BContractsService.name, 'B2B CRM use case started', {
      useCase: 'listMdrRules',
    });
    const rules = await this.repository.mdrRules.findAll({
      where: (contractVersionId ? { contractVersionId } : {}) as WhereOptions,
      order: [['created_at', 'DESC']],
      limit: 200,
    });

    const especificidad = (regla: {
      branchId: string | null;
      productCategory: string | null;
      riskSegment: string | null;
    }) => (regla.branchId ? 4 : 0) + (regla.productCategory ? 2 : 0) + (regla.riskSegment ? 1 : 0);

    return rules
      .map((regla) => ({
        id: regla.id,
        contractVersionId: regla.contractVersionId,
        ratePercent: regla.ratePercent,
        productCategory: regla.productCategory,
        branchId: regla.branchId,
        riskSegment: regla.riskSegment,
        minFeeAmount: regla.minFeeAmount,
        maxFeeAmount: regla.maxFeeAmount,
        isActive: regla.isActive,
        /* Cuanto pesa esta regla frente a las demas: es lo que decide cual gana. */
        specificity: especificidad(regla),
      }))
      .sort((a, b) => b.specificity - a.specificity);
  }

  async createMdrRule(input: CreateMdrRuleDto): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BContractsService.name, 'B2B CRM use case started', {
      useCase: 'createMdrRule',
    });

    if (
      input.minFeeAmount !== undefined &&
      input.maxFeeAmount !== undefined &&
      input.minFeeAmount > input.maxFeeAmount
    ) {
      throw new ConflictException('El piso de la comisión no puede superar su techo.');
    }

    const version = await this.repository.contractVersions.findByPk(input.contractVersionId);
    if (!version) throw new NotFoundException('Versión contractual no encontrada.');

    const regla = await this.repository.mdrRules.create({
      contractVersionId: input.contractVersionId,
      ratePercent: input.ratePercent,
      productCategory: input.productCategory ?? null,
      branchId: input.branchId ?? null,
      riskSegment: input.riskSegment ?? null,
      minFeeAmount: input.minFeeAmount ?? null,
      maxFeeAmount: input.maxFeeAmount ?? null,
      isActive: true,
    } as never);
    return { id: regla.id, ratePercent: regla.ratePercent, isActive: regla.isActive };
  }

  /**
   * Edita o desactiva una regla. La segmentacion NO se cambia.
   *
   * Cambiar a que segmento aplica una regla existente reescribe en silencio como se cobro el pasado
   * cuando alguien audite por que una venta pago lo que pago. Para cobrar distinto a otro segmento
   * se crea otra regla; para dejar de cobrar asi, se desactiva esta.
   */
  async updateMdrRule(ruleId: string, input: UpdateMdrRuleDto): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BContractsService.name, 'B2B CRM use case started', {
      useCase: 'updateMdrRule',
    });
    const regla = await this.repository.mdrRules.findByPk(ruleId);
    if (!regla) throw new NotFoundException('Regla de comisión no encontrada.');

    await regla.update({
      ...(input.ratePercent !== undefined ? { ratePercent: input.ratePercent } : {}),
      ...(input.minFeeAmount !== undefined ? { minFeeAmount: input.minFeeAmount } : {}),
      ...(input.maxFeeAmount !== undefined ? { maxFeeAmount: input.maxFeeAmount } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    });
    return { id: regla.id, ratePercent: regla.ratePercent, isActive: regla.isActive };
  }
}
