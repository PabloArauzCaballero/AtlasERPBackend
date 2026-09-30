import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
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
  SendProposalDto,
  UpdateProposalDto,
} from '../b2b-sales-crm.dtos';
import {
  createProposalSchema,
  decideApprovalSchema,
  idParamsSchema,
  proposalIdParamsSchema,
  rejectProposalSchema,
  sendProposalSchema,
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

  /* Contactos del comercio con correo: la pantalla pregunta a cuáles enviar antes de enviar. */
  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'ADMIN')
  @Get(':proposalId/recipients')
  listProposalRecipients(
    @Param(new ZodValidationPipe(proposalIdParamsSchema)) params: ProposalIdParamsDto,
  ): Promise<Record<string, unknown>[]> {
    return this.service.listProposalRecipients(params.proposalId);
  }

  /* La propuesta en PDF con membrete de ATLAS: lo mismo que se adjunta al correo. */
  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'FINANCE', 'LEGAL', 'ADMIN')
  @Get(':proposalId/pdf')
  async getProposalPdf(
    @Param(new ZodValidationPipe(proposalIdParamsSchema)) params: ProposalIdParamsDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.service.proposalPdf(params.proposalId);
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  /* Envía DE VERDAD la propuesta por correo a quienes se eligen; antes sólo cambiaba el estado. */
  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'ADMIN')
  @Patch(':proposalId/send')
  sendProposal(
    @Param(new ZodValidationPipe(proposalIdParamsSchema)) params: ProposalIdParamsDto,
    @Body(new ZodValidationPipe(sendProposalSchema)) body: SendProposalDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.service.sendProposal(params.proposalId, body, user);
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
