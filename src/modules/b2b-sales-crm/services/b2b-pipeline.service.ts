import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Op, WhereOptions } from 'sequelize';
import { env } from '../../../config/env';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import type { AuthUser } from '../../../common/types/auth-context.types';
import {
  AccountLifecycleStatus,
  ApprovalStatus,
  OpportunityStage,
  ProposalStatus,
  TermType,
} from '../b2b-sales-crm.enums';
import type {
  CreateOpportunityDto,
  CreateProposalDto,
  DecideApprovalDto,
  ListOpportunitiesQueryDto,
  MoveOpportunityStageDto,
  RejectProposalDto,
} from '../b2b-sales-crm.dtos';
import { toOpportunityResponse, toProposalResponse } from '../b2b-sales-crm.mapper';
import { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';
import { B2BSalesCrmUseCaseBase } from './b2b-sales-crm-use-case.base';

@Injectable()
export class B2BPipelineService extends B2BSalesCrmUseCaseBase {
  constructor(repository: B2BSalesCrmRepository, logger: PinoLoggerService) {
    super(repository, logger);
  }

  async createOpportunity(input: CreateOpportunityDto): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BPipelineService.name, 'B2B CRM use case started', {
      useCase: 'createOpportunity',
    });
    const account = await this.repository.accounts.findByPk(input.accountId);

    if (!account) {
      throw new NotFoundException('Cuenta B2B no encontrada.');
    }

    if (account.lifecycleStatus === AccountLifecycleStatus.DISQUALIFIED) {
      throw new ConflictException(
        'Una cuenta descalificada no puede tener propuesta u oportunidad activa sin reapertura aprobada.',
      );
    }

    const opportunity = await this.repository.opportunities.create({
      accountId: input.accountId,
      ownerUserId: input.ownerUserId,
      name: input.name,
      opportunityType: input.opportunityType,
      stage: OpportunityStage.DISCOVERY,
      expectedMonthlyVolume: input.expectedMonthlyVolume?.toFixed(2) ?? null,
      expectedMdrRate: input.expectedMdrRate?.toFixed(6) ?? null,
      expectedMonthlyRevenue: this.calculateExpectedRevenue(
        input.expectedMonthlyVolume,
        input.expectedMdrRate,
      ),
      probability: input.probability.toFixed(2),
      expectedCloseDate: input.expectedCloseDate ?? null,
    });

    return toOpportunityResponse(opportunity);
  }

  async listOpportunities(
    query: ListOpportunitiesQueryDto,
  ): Promise<Record<string, unknown>[]> {
    const where: Record<string, unknown> = {};
    if (query.accountId) where.accountId = query.accountId;
    if (query.stage) where.stage = query.stage;
    const opportunities = await this.repository.opportunities.findAll({
      where: where as WhereOptions,
      order: [['createdAt', 'DESC']],
    });
    return opportunities.map(toOpportunityResponse);
  }

  async moveOpportunityStage(
    id: string,
    input: MoveOpportunityStageDto,
  ): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BPipelineService.name, 'B2B CRM use case started', {
      useCase: 'moveOpportunityStage',
    });
    const opportunity = await this.repository.opportunities.findByPk(id);

    if (!opportunity) {
      throw new NotFoundException('Oportunidad no encontrada.');
    }

    if (input.stage === OpportunityStage.CONTRACTING) {
      const acceptedProposal = await this.repository.proposals.findOne({
        where: { opportunityId: id, status: ProposalStatus.ACCEPTED },
      });

      if (!acceptedProposal) {
        throw new ConflictException(
          'La oportunidad no puede pasar a CONTRACTING sin propuesta aceptada.',
        );
      }
    }

    if (input.stage === OpportunityStage.CLOSED_LOST && !input.lossReason) {
      throw new BadRequestException('Debe registrar motivo de pérdida para CLOSED_LOST.');
    }

    await opportunity.update({
      stage: input.stage,
      lossReason: input.lossReason ?? null,
      updatedAt: new Date(),
    });
    return toOpportunityResponse(opportunity);
  }

  async createProposal(input: CreateProposalDto, user: AuthUser): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BPipelineService.name, 'B2B CRM use case started', {
      useCase: 'createProposal',
    });
    return this.repository.transaction(async (transaction) => {
      const opportunity = await this.repository.opportunities.findByPk(input.opportunityId, {
        transaction,
      });

      if (!opportunity) {
        throw new NotFoundException('Oportunidad no encontrada.');
      }

      const mdrBelowMinimum = input.lines.some(
        (line) =>
          line.termType === TermType.MDR &&
          line.ratePercent !== undefined &&
          line.ratePercent < env.DEFAULT_MIN_MDR_RATE_PERCENT,
      );

      if (mdrBelowMinimum && !input.pricingExceptionReason) {
        throw new BadRequestException(
          'La propuesta tiene MDR menor al mínimo y requiere justificación de excepción.',
        );
      }

      const proposal = await this.repository.proposals.create(
        {
          opportunityId: opportunity.id,
          accountId: opportunity.accountId,
          proposalNumber: input.proposalNumber,
          status: mdrBelowMinimum ? ProposalStatus.PENDING_APPROVAL : ProposalStatus.DRAFT,
          validUntil: input.validUntil ?? null,
          totalEstimatedMonthlyRevenue: input.totalEstimatedMonthlyRevenue?.toFixed(2) ?? null,
          createdByUserId: user.sub,
        },
        { transaction },
      );

      for (const line of input.lines) {
        await this.repository.proposalLines.create(
          {
            proposalId: proposal.id,
            termType: line.termType,
            description: line.description,
            ratePercent: line.ratePercent?.toFixed(6) ?? null,
            fixedAmount: line.fixedAmount?.toFixed(2) ?? null,
            currency: line.currency,
            billingTiming: line.billingTiming,
            minimumMonthlyAmount: line.minimumMonthlyAmount?.toFixed(2) ?? null,
          },
          { transaction },
        );
      }

      if (mdrBelowMinimum) {
        await this.repository.approvalRequests.create(
          {
            proposalId: proposal.id,
            requestedByUserId: user.sub,
            approvalType: 'MDR_BELOW_MINIMUM',
            reason: input.pricingExceptionReason ?? 'MDR menor al mínimo configurado.',
            status: ApprovalStatus.PENDING,
          },
          { transaction },
        );
      }

      await opportunity.update(
        { stage: OpportunityStage.PROPOSAL, updatedAt: new Date() },
        { transaction },
      );
      const created = await this.repository.findProposalWithLines(proposal.id, transaction);
      return toProposalResponse(
        this.requireEntity(created, 'Propuesta no encontrada luego de crear.'),
      );
    });
  }

  async sendProposal(proposalId: string): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BPipelineService.name, 'B2B CRM use case started', {
      useCase: 'sendProposal',
    });
    const proposal = await this.repository.findProposalWithLines(proposalId);

    if (!proposal) {
      throw new NotFoundException('Propuesta no encontrada.');
    }

    const pendingApproval = await this.repository.approvalRequests.findOne({
      where: { proposalId, status: ApprovalStatus.PENDING },
    });

    if (pendingApproval) {
      throw new ConflictException(
        'La propuesta tiene aprobaciones pendientes y no puede enviarse.',
      );
    }

    await proposal.update({ status: ProposalStatus.SENT, sentAt: new Date() });
    return toProposalResponse(proposal);
  }

  async acceptProposal(proposalId: string): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BPipelineService.name, 'B2B CRM use case started', {
      useCase: 'acceptProposal',
    });
    return this.repository.transaction(async (transaction) => {
      const proposal = await this.repository.findProposalWithLines(proposalId, transaction);

      if (!proposal) {
        throw new NotFoundException('Propuesta no encontrada.');
      }

      if (proposal.status !== ProposalStatus.SENT) {
        throw new ConflictException('Solo una propuesta enviada puede aceptarse.');
      }

      const existingAcceptedProposal = await this.repository.proposals.findOne({
        where: {
          opportunityId: proposal.opportunityId,
          status: ProposalStatus.ACCEPTED,
          id: { [Op.ne]: proposal.id },
        },
        transaction,
      });

      if (existingAcceptedProposal) {
        throw new ConflictException('La oportunidad ya tiene una propuesta aceptada.');
      }

      await proposal.update(
        { status: ProposalStatus.ACCEPTED, acceptedAt: new Date() },
        { transaction },
      );
      await this.repository.opportunities.update(
        { stage: OpportunityStage.CONTRACTING, updatedAt: new Date() },
        { where: { id: proposal.opportunityId }, transaction },
      );

      return toProposalResponse(proposal);
    });
  }

  async rejectProposal(
    proposalId: string,
    _input: RejectProposalDto,
  ): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BPipelineService.name, 'B2B CRM use case started', {
      useCase: 'rejectProposal',
    });
    const proposal = await this.repository.findProposalWithLines(proposalId);

    if (!proposal) {
      throw new NotFoundException('Propuesta no encontrada.');
    }

    await proposal.update({ status: ProposalStatus.REJECTED, rejectedAt: new Date() });
    return toProposalResponse(proposal);
  }

  async decideApproval(
    approvalId: string,
    input: DecideApprovalDto,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BPipelineService.name, 'B2B CRM use case started', {
      useCase: 'decideApproval',
    });
    const approval = await this.repository.approvalRequests.findByPk(approvalId);

    if (!approval) {
      throw new NotFoundException('Solicitud de aprobación no encontrada.');
    }

    if (approval.status !== ApprovalStatus.PENDING) {
      throw new ConflictException('La solicitud de aprobación ya fue decidida.');
    }

    await approval.update({
      status: input.status,
      approvedByUserId: user.sub,
      decidedAt: new Date(),
      reason: input.reason,
    });

    if (approval.proposalId && input.status === ApprovalStatus.APPROVED) {
      await this.repository.proposals.update(
        { status: ProposalStatus.DRAFT },
        { where: { id: approval.proposalId, status: ProposalStatus.PENDING_APPROVAL } },
      );
    }

    if (approval.proposalId && input.status === ApprovalStatus.REJECTED) {
      await this.repository.proposals.update(
        { status: ProposalStatus.REJECTED, rejectedAt: new Date() },
        { where: { id: approval.proposalId } },
      );
    }

    return {
      id: approval.id,
      proposalId: approval.proposalId,
      status: approval.status,
      approvedByUserId: approval.approvedByUserId,
      decidedAt: approval.decidedAt,
    };
  }
}
