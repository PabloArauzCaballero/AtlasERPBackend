import { Body, Controller, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../../common/types/auth-context.types';
import { RequestId } from '../decorators/request-id.decorator';
import { AdsBillingService } from '../services/billing.service';
import { invoiceIdParamSchema, periodCloseSchema, registerPaymentSchema } from '../ads.schemas';
import type { InvoiceIdParamDto, PeriodCloseDto, RegisterPaymentDto } from '../ads.dtos';

@Controller('admin/ads')
export class AdminAdsBillingController {
  constructor(private readonly billingService: AdsBillingService) {}

  @Post('billing/period-close')
  @Roles('ADS_FINANCE')
  closeBillingPeriod(
    @Body(new ZodValidationPipe(periodCloseSchema)) body: PeriodCloseDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.billingService.closePeriod(body, { user, requestId });
  }

  @Post('invoices/:invoiceId/payments')
  @Roles('ADS_FINANCE')
  registerPayment(
    @Param(new ZodValidationPipe(invoiceIdParamSchema)) params: InvoiceIdParamDto,
    @Body(new ZodValidationPipe(registerPaymentSchema)) body: RegisterPaymentDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.billingService.registerPayment(params.invoiceId, body, { user, requestId });
  }
}
