import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../../common/types/auth-context.types';
import type {
  CreateProposalDto,
  DecideApprovalDto,
  IdParamsDto,
  ProposalIdParamsDto,
  RejectProposalDto,
} from '../b2b-sales-crm.dtos';
import {
  createProposalSchema,
  decideApprovalSchema,
  idParamsSchema,
  proposalIdParamsSchema,
  rejectProposalSchema,
} from '../b2b-sales-crm.schemas';
import { B2BSalesCrmService } from '../services/b2b-sales-crm.service';

@Controller('b2b/proposals')
export class ProposalsController {
  constructor(private readonly service: B2BSalesCrmService) {}

  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'ADMIN')
  @Post()
  createProposal(
    @Body(new ZodValidationPipe(createProposalSchema)) body: CreateProposalDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.service.createProposal(body, user);
  }

  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'ADMIN')
  @Patch(':proposalId/send')
  sendProposal(
    @Param(new ZodValidationPipe(proposalIdParamsSchema)) params: ProposalIdParamsDto,
  ): Promise<Record<string, unknown>> {
    return this.service.sendProposal(params.proposalId);
  }

  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'ADMIN')
  @Patch(':proposalId/accept')
  acceptProposal(
    @Param(new ZodValidationPipe(proposalIdParamsSchema)) params: ProposalIdParamsDto,
  ): Promise<Record<string, unknown>> {
    return this.service.acceptProposal(params.proposalId);
  }

  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'ADMIN')
  @Patch(':proposalId/reject')
  rejectProposal(
    @Param(new ZodValidationPipe(proposalIdParamsSchema)) params: ProposalIdParamsDto,
    @Body(new ZodValidationPipe(rejectProposalSchema)) body: RejectProposalDto,
  ): Promise<Record<string, unknown>> {
    return this.service.rejectProposal(params.proposalId, body);
  }

  @Roles('COMMERCIAL_MANAGER', 'FINANCE', 'ADMIN')
  @Patch('approvals/:id/decision')
  decideApproval(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Body(new ZodValidationPipe(decideApprovalSchema)) body: DecideApprovalDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.service.decideApproval(params.id, body, user);
  }
}
