import { BadRequestException, Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { EmailMessagingService } from '../services/email-messaging.service';
import {
  createEmailSuppressionSchema,
  emailTrackingParamSchema,
  sendCampaignEmailSchema,
} from '../email-messaging.schemas';
import type { CreateEmailSuppressionDto, SendCampaignEmailDto } from '../email-messaging.schemas';

@Controller('admin/ads')
export class AdminAdsEmailController {
  constructor(private readonly emailMessagingService: EmailMessagingService) {}

  @Post('email/send')
  @Roles('ADS_ADMIN_MANAGER', 'ADS_ADMIN_OPERATOR')
  sendCampaignEmail(
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(sendCampaignEmailSchema)) body: SendCampaignEmailDto,
  ) {
    if (!idempotencyKey) throw new BadRequestException('X-Idempotency-Key header is required.');
    return this.emailMessagingService.enqueue(body, idempotencyKey);
  }

  @Get('email/tracking/:trackingId')
  @Roles('ADS_ADMIN_VIEWER', 'ADS_ADMIN_MANAGER', 'ADS_ADMIN_OPERATOR', 'ADS_AUDITOR')
  getEmailTracking(
    @Param(new ZodValidationPipe(emailTrackingParamSchema)) params: { trackingId: string },
  ) {
    return this.emailMessagingService.tracking(params.trackingId);
  }

  @Post('email/suppressions')
  @Roles('ADS_ADMIN_MANAGER', 'ADS_COMPLIANCE_ADMIN')
  suppressEmail(
    @Body(new ZodValidationPipe(createEmailSuppressionSchema)) body: CreateEmailSuppressionDto,
  ) {
    return this.emailMessagingService.suppress(body);
  }

  @Get('email/suppressions')
  @Roles('ADS_ADMIN_VIEWER', 'ADS_ADMIN_MANAGER', 'ADS_COMPLIANCE_ADMIN', 'ADS_AUDITOR')
  listEmailSuppressions() {
    return this.emailMessagingService.listSuppressions();
  }
}
