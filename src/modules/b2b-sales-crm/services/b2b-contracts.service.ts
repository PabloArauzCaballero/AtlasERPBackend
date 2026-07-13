import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Op } from 'sequelize';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import {
  ContractStatus,
  ContractVersionStatus,
  OpportunityStage,
  ProposalStatus,
} from '../b2b-sales-crm.enums';
import type { CreateContractFromProposalDto, SignContractDto } from '../b2b-sales-crm.dtos';
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
}
