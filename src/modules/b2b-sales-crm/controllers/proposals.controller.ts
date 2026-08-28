import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
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
  UpdateProposalDto,
} from '../b2b-sales-crm.dtos';
import {
  createProposalSchema,
  decideApprovalSchema,
  idParamsSchema,
  proposalIdParamsSchema,
  rejectProposalSchema,
  updateProposalSchema,
} from '../b2b-sales-crm.schemas';
import { B2BSalesCrmService } from '../services/b2b-sales-crm.service';

@Controller('b2b/proposals')
export class ProposalsController {
  constructor(private readonly service: B2BSalesCrmService) {}

  /* Lectura de la cartera de propuestas. Faltaba, y por eso la pantalla pedia uuids tecleados. */
  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'FINANCE', 'LEGAL', 'ADMIN')
  @Get()
  listProposals(): Promise<Record<string, unknown>[]> {
    return this.service.listProposals();
  }

  /*
   * La cola de aprobaciones. Sin esto la pantalla admitia que «el backend solo expone la decision
   * PATCH» y obligaba a actuar sobre un uuid obtenido a mano del flujo de propuesta.
   */
  @Roles('COMMERCIAL_MANAGER', 'FINANCE', 'LEGAL', 'ADMIN')
  @Get('approvals')
  listApprovals(@Query('onlyPending') onlyPending?: string): Promise<Record<string, unknown>[]> {
    return this.service.listApprovals(onlyPending !== 'false');
  }

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

  /*
   * Editar y retirar. Sin estas dos, el listado de propuestas solo sabia crecer: una propuesta con
   * el numero mal escrito no se podia corregir ni quitar, y la pantalla no podia ofrecer el lapiz
   * ni la papelera que si tiene el resto del ERP. Van DESPUES de las rutas con segmento fijo
   * (`approvals/...`): Nest resuelve por orden de declaracion y `:proposalId` se las tragaria.
   */
  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'ADMIN')
  @Patch(':proposalId')
  updateProposal(
    @Param(new ZodValidationPipe(proposalIdParamsSchema)) params: ProposalIdParamsDto,
    @Body(new ZodValidationPipe(updateProposalSchema)) body: UpdateProposalDto,
  ): Promise<Record<string, unknown>> {
    return this.service.updateProposal(params.proposalId, body);
  }

  @Roles('COMMERCIAL_MANAGER', 'ADMIN')
  @Delete(':proposalId')
  deleteProposal(
    @Param(new ZodValidationPipe(proposalIdParamsSchema)) params: ProposalIdParamsDto,
  ): Promise<{ id: string; proposalNumber: string }> {
    return this.service.deleteProposal(params.proposalId);
  }
}
