import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../../../common/types/auth-context.types';
import {
  CreateBillingEventDto,
  IssueArInvoiceDto,
  createBillingEventSchema,
  issueArInvoiceSchema,
} from '../../shared/schemas/accounting.schemas';
import { BillingService } from '../services/billing.service';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

@Roles('admin', 'accountant')
@Controller('accounting/billing')
export class BillingController {
  constructor(
    private readonly service: BillingService,
    private readonly logger: PinoLoggerService,
  ) {}

  @Get('events')
  listEvents() {
    return this.service.listEvents();
  }

  @Get('ar-invoices')
  listInvoices(@CurrentUser() user: AuthUser) {
    return this.service.listInvoices(user);
  }

  /** Detalle con líneas y partes: lo que se imprime al descargar la factura. */
  @Get('ar-invoices/:id')
  getInvoice(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.getInvoice(id, user);
  }

  @Patch('ar-invoices/:id')
  updateInvoice(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateInvoice(id, body, user);
  }

  @Delete('ar-invoices/:id')
  deleteInvoice(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.deleteInvoice(id, user);
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
    return this.service.createBillingEvent(body, user);
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
    return this.service.issueInvoice(body, user);
  }
}
