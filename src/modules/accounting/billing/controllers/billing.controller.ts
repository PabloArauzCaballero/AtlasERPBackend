import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../../../common/types/auth-context.types';
import {
  CreateBillingEventDto,
  IssueArInvoiceDto,
  UpdateArInvoiceDto,
  createBillingEventSchema,
  issueArInvoiceSchema,
  updateArInvoiceSchema,
} from '../../shared/schemas/accounting.schemas';
import { ArInvoiceIssuanceService } from '../services/ar-invoice-issuance.service';
import { ArInvoiceMaintenanceService } from '../services/ar-invoice-maintenance.service';
import { ArInvoiceQueries } from '../services/ar-invoice-queries.service';
import { BillingEventsService } from '../services/billing-events.service';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

@Roles('admin', 'accountant')
@Controller('accounting/billing')
export class BillingController {
  constructor(
    private readonly queries: ArInvoiceQueries,
    private readonly maintenance: ArInvoiceMaintenanceService,
    private readonly events: BillingEventsService,
    private readonly issuance: ArInvoiceIssuanceService,
    private readonly logger: PinoLoggerService,
  ) {}

  @Get('events')
  listEvents(@CurrentUser() user: AuthUser) {
    return this.queries.listEvents(user);
  }

  @Get('ar-invoices')
  listInvoices(@CurrentUser() user: AuthUser) {
    return this.queries.listInvoices(user);
  }

  /** Detalle con líneas y partes: lo que se imprime al descargar la factura. */
  @Get('ar-invoices/:id')
  getInvoice(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.queries.getInvoice(id, user);
  }

  @Patch('ar-invoices/:id')
  updateInvoice(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateArInvoiceSchema)) body: UpdateArInvoiceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.maintenance.updateInvoice(id, body, user);
  }

  @Delete('ar-invoices/:id')
  deleteInvoice(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.maintenance.deleteInvoice(id, user);
  }

  @Post('events')
  createBillingEvent(
    @Body(new ZodValidationPipe(createBillingEventSchema)) body: CreateBillingEventDto,
    @CurrentUser() user: AuthUser,
  ) {
    this.logger.info('Endpoint createBillingEvent recibido.', {
      layer: 'controller',
      module: 'billing',
      action: 'createBillingEvent',
      contractId: body.contractId,
      externalRef: body.externalRef,
      userId: user.sub,
    });
    return this.events.createBillingEvent(body, user);
  }

  @Post('ar-invoices')
  issueInvoice(
    @Body(new ZodValidationPipe(issueArInvoiceSchema)) body: IssueArInvoiceDto,
    @CurrentUser() user: AuthUser,
  ) {
    this.logger.info('Endpoint issueInvoice recibido.', {
      layer: 'controller',
      module: 'billing',
      action: 'issueInvoice',
      legalEntityId: body.legalEntityId,
      userId: user.sub,
    });
    return this.issuance.issueInvoice(body, user);
  }
}
