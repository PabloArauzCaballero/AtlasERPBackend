import { Get, Body, Controller, Param, Post, Patch } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../../common/types/auth-context.types';
import type {
  IdParamsDto,
  IssueInvoiceDto,
  PostMerchantInvoiceToGlDto,
  RegisterMerchantPaymentDto,
} from '../b2b-sales-crm.dtos';
import {
  idParamsSchema,
  issueInvoiceSchema,
  postMerchantInvoiceToGlSchema,
  registerMerchantPaymentSchema,
} from '../b2b-sales-crm.schemas';
import { B2BBnplBillingService } from '../services/b2b-bnpl-billing.service';
import { B2BReconciliationService } from '../services/b2b-reconciliation.service';
import { MerchantAccountingBridgeService } from '../services/merchant-accounting-bridge.service';

@Controller('b2b/billing')
export class BillingController {
  constructor(
    private readonly reconciliation: B2BReconciliationService,
    private readonly bnplBilling: B2BBnplBillingService,
    private readonly bridge: MerchantAccountingBridgeService,
  ) {}

  /* Lectura de facturas de comercio. Faltaba: la pantalla pedia el uuid de la factura a mano. */
  @Roles('FINANCE', 'OPERATIONS', 'ADMIN')
  @Get('invoices')
  listInvoices(): Promise<Record<string, unknown>[]> {
    return this.reconciliation.listMerchantInvoices();
  }

  /** Detalle con líneas: es lo que se imprime cuando el usuario descarga la factura. */
  @Roles('FINANCE', 'OPERATIONS', 'ADMIN')
  @Get('invoices/:id')
  getInvoice(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
  ): Promise<Record<string, unknown>> {
    return this.reconciliation.getMerchantInvoice(params.id);
  }

  @Roles('FINANCE', 'ADMIN')
  @Post('invoices')
  issueInvoice(
    @Body(new ZodValidationPipe(issueInvoiceSchema)) body: IssueInvoiceDto,
  ): Promise<Record<string, unknown>> {
    return this.bnplBilling.issueInvoice(body);
  }

  @Roles('FINANCE', 'ADMIN')
  @Post('merchant-payments')
  registerPayment(
    @Body(new ZodValidationPipe(registerMerchantPaymentSchema)) body: RegisterMerchantPaymentDto,
  ): Promise<Record<string, unknown>> {
    return this.bnplBilling.registerMerchantPayment(body);
  }

  /** Puente #8: genera el asiento de venta (Debe CxC / Haber Ingreso / Haber IVA) de una factura merchant. */
  @Roles('FINANCE', 'ADMIN', 'ACCOUNTANT')
  @Patch('invoices/:id/post-to-gl')
  postInvoiceToGl(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Body(new ZodValidationPipe(postMerchantInvoiceToGlSchema)) body: PostMerchantInvoiceToGlDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.bridge.postInvoiceToGl(params.id, body, user);
  }
}
