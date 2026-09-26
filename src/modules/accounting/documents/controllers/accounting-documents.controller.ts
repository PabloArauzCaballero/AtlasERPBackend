import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { AuthUser } from '../../../../common/types/auth-context.types';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import {
  BulkCreateAccountingDocumentsDto,
  CreateAccountingDocumentDto,
  DecideAccountingDocumentDto,
  ListAccountingDocumentsQueryDto,
  ReverseAccountingDocumentDto,
  bulkCreateAccountingDocumentsSchema,
  createAccountingDocumentSchema,
  decideAccountingDocumentSchema,
  idParamsSchema,
  listAccountingDocumentsQuerySchema,
  reverseAccountingDocumentSchema,
} from '../../shared/schemas/accounting.schemas';
import { AccountingDocumentsService } from '../services/accounting-documents.service';
import { DocumentApprovalService } from '../services/document-approval.service';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

@Roles('admin', 'accountant', 'cfo')
@Controller('accounting/documents')
export class AccountingDocumentsController {
  constructor(
    private readonly service: AccountingDocumentsService,
    private readonly approvalService: DocumentApprovalService,
    private readonly logger: PinoLoggerService,
  ) {}

  @Post('bulk')
  createDraftBulk(
    @Body(new ZodValidationPipe(bulkCreateAccountingDocumentsSchema))
    body: BulkCreateAccountingDocumentsDto,
    @CurrentUser() user: AuthUser,
  ) {
    this.logger.info('Endpoint createDraftBulk recibido.', {
      layer: 'controller',
      module: 'accounting-documents',
      action: 'createDraftBulk',
      itemCount: body.items.length,
      batchExternalId: body.batchExternalId ?? null,
      userId: user.sub,
    });
    return this.service.createDraftBulk(body, user);
  }

  @Post()
  createDraft(
    @Body(new ZodValidationPipe(createAccountingDocumentSchema)) body: CreateAccountingDocumentDto,
    @CurrentUser() user: AuthUser,
  ) {
    this.logger.info('Endpoint createDraft recibido.', {
      layer: 'controller',
      module: 'accounting-documents',
      action: 'createDraft',
      documentNo: body.documentNo,
      legalEntityId: body.legalEntityId,
      userId: user.sub,
    });
    return this.service.createDraft(body, user);
  }

  @Patch(':id/post')
  postDocument(
    @Param(new ZodValidationPipe(idParamsSchema)) params: { id: string },
    @CurrentUser() user: AuthUser,
  ) {
    this.logger.info('Endpoint postDocument recibido.', {
      layer: 'controller',
      module: 'accounting-documents',
      action: 'postDocument',
      accountingDocumentId: params.id,
      userId: user.sub,
    });
    return this.service.postDocument(params.id, user);
  }

  /*
   * Aprobar y rechazar un borrador PENDING (ATL-03). Método con su propio @Roles: el contable crea,
   * pero decide un CFO o un ADMIN, y nunca quien lo creó (403). Provisional hasta DEC-10.
   */
  @Roles('admin', 'cfo')
  @Patch(':id/approve')
  approveDocument(
    @Param(new ZodValidationPipe(idParamsSchema)) params: { id: string },
    @Body(new ZodValidationPipe(decideAccountingDocumentSchema)) body: DecideAccountingDocumentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.approvalService.approve(params.id, user, body.reason);
  }

  @Roles('admin', 'cfo')
  @Patch(':id/reject')
  rejectDocument(
    @Param(new ZodValidationPipe(idParamsSchema)) params: { id: string },
    @Body(new ZodValidationPipe(decideAccountingDocumentSchema)) body: DecideAccountingDocumentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.approvalService.reject(params.id, user, body.reason);
  }

  @Post(':id/reverse')
  reverseDocument(
    @Param(new ZodValidationPipe(idParamsSchema)) params: { id: string },
    @Body(new ZodValidationPipe(reverseAccountingDocumentSchema))
    body: ReverseAccountingDocumentDto,
    @CurrentUser() user: AuthUser,
  ) {
    this.logger.info('Endpoint reverseDocument recibido.', {
      layer: 'controller',
      module: 'accounting-documents',
      action: 'reverseDocument',
      accountingDocumentId: params.id,
      userId: user.sub,
    });
    return this.service.reverseDocument(params.id, body, user);
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(listAccountingDocumentsQuerySchema))
    query: ListAccountingDocumentsQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.list(user, query);
  }

  @Get(':id')
  getDocument(
    @Param(new ZodValidationPipe(idParamsSchema)) params: { id: string },
    @CurrentUser() user: AuthUser,
  ) {
    this.logger.debug('Endpoint getDocument recibido.', {
      layer: 'controller',
      module: 'accounting-documents',
      action: 'getDocument',
      accountingDocumentId: params.id,
      userId: user.sub,
    });
    return this.service.getDocumentForUser(params.id, user);
  }
}
