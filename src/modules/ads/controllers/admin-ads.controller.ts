import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../../common/types/auth-context.types';
import { RequestId } from '../decorators/request-id.decorator';
import { AdminAdsService } from '../services/admin-ads.service';
import { AdsModerationService } from '../services/moderation.service';
import { AdsBillingService } from '../services/billing.service';
import { AdsDeliveryService } from '../services/delivery.service';
import { AdsAuditService } from '../services/audit.service';
import { EmailMessagingService } from '../services/email-messaging.service';
import {
  createEmailSuppressionSchema,
  emailTrackingParamSchema,
  sendCampaignEmailSchema,
} from '../email-messaging.schemas';
import type { CreateEmailSuppressionDto, SendCampaignEmailDto } from '../email-messaging.schemas';
import {
  advertiserIdParamSchema,
  bulkCreateAdvertisersSchema,
  auditQuerySchema,
  campaignIdParamSchema,
  createAdvertiserSchema,
  createBillingProfileSchema,
  createInventoryPlacementSchema,
  createPolicyRuleSchema,
  dashboardQuerySchema,
  deliveryMonitorQuerySchema,
  eventIdParamSchema,
  invoiceIdParamSchema,
  listAdvertisersQuerySchema,
  listCampaignsQuerySchema,
  listInventoryQuerySchema,
  listPoliciesQuerySchema,
  moderationDecisionSchema,
  moderationQueueQuerySchema,
  periodCloseSchema,
  registerPaymentSchema,
  reviewIdParamSchema,
  updateAdvertiserStatusSchema,
  updateBillableStatusSchema,
  updateCampaignStatusSchema,
} from '../ads.schemas';
import type {
  AdvertiserIdParamDto,
  BulkCreateAdvertisersDto,
  AuditQueryDto,
  CampaignIdParamDto,
  CreateAdvertiserDto,
  CreateBillingProfileDto,
  CreateInventoryPlacementDto,
  CreatePolicyRuleDto,
  DashboardQueryDto,
  DeliveryMonitorQueryDto,
  EventIdParamDto,
  InvoiceIdParamDto,
  ListAdvertisersQueryDto,
  ListCampaignsQueryDto,
  ListInventoryQueryDto,
  ListPoliciesQueryDto,
  ModerationDecisionDto,
  ModerationQueueQueryDto,
  PeriodCloseDto,
  RegisterPaymentDto,
  ReviewIdParamDto,
  UpdateAdvertiserStatusDto,
  UpdateBillableStatusDto,
  UpdateCampaignStatusDto,
} from '../ads.dtos';

@Controller('admin/ads')
export class AdminAdsController {
  constructor(
    private readonly adminAdsService: AdminAdsService,
    private readonly moderationService: AdsModerationService,
    private readonly billingService: AdsBillingService,
    private readonly deliveryService: AdsDeliveryService,
    private readonly auditService: AdsAuditService,
    private readonly emailMessagingService: EmailMessagingService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AdminAdsController.name);
  }

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

  @Get('dashboard')
  @Roles(
    'ADS_ADMIN_VIEWER',
    'ADS_ADMIN_MANAGER',
    'ADS_ADMIN_OPERATOR',
    'ADS_FINANCE',
    'ADS_AUDITOR',
  )
  getDashboard(@Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQueryDto) {
    this.logger.debug({ query }, 'Admin dashboard requested');
    return this.adminAdsService.getDashboard(query);
  }

  @Get('advertisers')
  @Roles('ADS_ADMIN_VIEWER', 'ADS_ADMIN_MANAGER', 'ADS_FINANCE', 'ADS_AUDITOR')
  listAdvertisers(
    @Query(new ZodValidationPipe(listAdvertisersQuerySchema)) query: ListAdvertisersQueryDto,
  ) {
    return this.adminAdsService.listAdvertisers(query);
  }

  @Post('advertisers/bulk')
  @Roles('ADS_ADMIN_MANAGER')
  bulkCreateAdvertisers(
    @Body(new ZodValidationPipe(bulkCreateAdvertisersSchema)) body: BulkCreateAdvertisersDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.adminAdsService.bulkCreateAdvertisers(body, { user, requestId });
  }

  @Post('advertisers')
  @Roles('ADS_ADMIN_MANAGER')
  createAdvertiser(
    @Body(new ZodValidationPipe(createAdvertiserSchema)) body: CreateAdvertiserDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.adminAdsService.createAdvertiser(body, { user, requestId });
  }

  @Post('advertisers/:advertiserId/billing-profiles')
  @Roles('ADS_ADMIN_MANAGER', 'ADS_FINANCE')
  createBillingProfile(
    @Param(new ZodValidationPipe(advertiserIdParamSchema)) params: AdvertiserIdParamDto,
    @Body(new ZodValidationPipe(createBillingProfileSchema)) body: CreateBillingProfileDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.adminAdsService.createBillingProfile(params.advertiserId, body, {
      user,
      requestId,
    });
  }

  @Get('advertisers/:advertiserId')
  @Roles('ADS_ADMIN_VIEWER', 'ADS_ADMIN_MANAGER', 'ADS_FINANCE', 'ADS_AUDITOR')
  getAdvertiser(
    @Param(new ZodValidationPipe(advertiserIdParamSchema)) params: AdvertiserIdParamDto,
  ) {
    return this.adminAdsService.getAdvertiserDetail(params.advertiserId);
  }

  @Patch('advertisers/:advertiserId/status')
  @Roles('ADS_ADMIN_MANAGER')
  updateAdvertiserStatus(
    @Param(new ZodValidationPipe(advertiserIdParamSchema)) params: AdvertiserIdParamDto,
    @Body(new ZodValidationPipe(updateAdvertiserStatusSchema)) body: UpdateAdvertiserStatusDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.adminAdsService.updateAdvertiserStatus(params.advertiserId, body, {
      user,
      requestId,
    });
  }

  @Get('campaigns')
  @Roles(
    'ADS_ADMIN_VIEWER',
    'ADS_ADMIN_MANAGER',
    'ADS_ADMIN_OPERATOR',
    'ADS_MODERATOR',
    'ADS_FINANCE',
    'ADS_AUDITOR',
  )
  listCampaigns(
    @Query(new ZodValidationPipe(listCampaignsQuerySchema)) query: ListCampaignsQueryDto,
  ) {
    return this.adminAdsService.listCampaigns(query);
  }

  @Get('campaigns/:campaignId')
  @Roles(
    'ADS_ADMIN_VIEWER',
    'ADS_ADMIN_MANAGER',
    'ADS_ADMIN_OPERATOR',
    'ADS_MODERATOR',
    'ADS_FINANCE',
    'ADS_AUDITOR',
  )
  getCampaign(@Param(new ZodValidationPipe(campaignIdParamSchema)) params: CampaignIdParamDto) {
    return this.adminAdsService.getCampaignDetail(params.campaignId);
  }

  @Patch('campaigns/:campaignId/status')
  @Roles('ADS_ADMIN_OPERATOR', 'ADS_ADMIN_MANAGER')
  updateCampaignStatus(
    @Param(new ZodValidationPipe(campaignIdParamSchema)) params: CampaignIdParamDto,
    @Body(new ZodValidationPipe(updateCampaignStatusSchema)) body: UpdateCampaignStatusDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.adminAdsService.updateCampaignStatus(params.campaignId, body, { user, requestId });
  }

  @Get('moderation/queue')
  @Roles('ADS_ADMIN_VIEWER', 'ADS_MODERATOR', 'ADS_COMPLIANCE_ADMIN', 'ADS_AUDITOR')
  listModerationQueue(
    @Query(new ZodValidationPipe(moderationQueueQuerySchema)) query: ModerationQueueQueryDto,
  ) {
    return this.moderationService.listQueue(query);
  }

  @Post('moderation/:reviewId/decision')
  @Roles('ADS_MODERATOR', 'ADS_COMPLIANCE_ADMIN')
  decideModeration(
    @Param(new ZodValidationPipe(reviewIdParamSchema)) params: ReviewIdParamDto,
    @Body(new ZodValidationPipe(moderationDecisionSchema)) body: ModerationDecisionDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.moderationService.decide(params.reviewId, body, { user, requestId });
  }

  @Get('inventory')
  @Roles(
    'ADS_ADMIN_VIEWER',
    'ADS_ADMIN_MANAGER',
    'ADS_ADMIN_OPERATOR',
    'ADS_INVENTORY_MANAGER',
    'ADS_AUDITOR',
  )
  listInventory(
    @Query(new ZodValidationPipe(listInventoryQuerySchema)) query: ListInventoryQueryDto,
  ) {
    return this.adminAdsService.listInventory(query);
  }

  @Post('inventory')
  @Roles('ADS_INVENTORY_MANAGER')
  createInventory(
    @Body(new ZodValidationPipe(createInventoryPlacementSchema)) body: CreateInventoryPlacementDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.adminAdsService.createInventoryPlacement(body, { user, requestId });
  }

  @Get('policies')
  @Roles('ADS_ADMIN_VIEWER', 'ADS_MODERATOR', 'ADS_COMPLIANCE_ADMIN', 'ADS_AUDITOR')
  listPolicies(@Query(new ZodValidationPipe(listPoliciesQuerySchema)) query: ListPoliciesQueryDto) {
    return this.adminAdsService.listPolicies(query);
  }

  @Post('policies')
  @Roles('ADS_COMPLIANCE_ADMIN')
  createPolicy(
    @Body(new ZodValidationPipe(createPolicyRuleSchema)) body: CreatePolicyRuleDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.adminAdsService.createPolicyRule(body, { user, requestId });
  }

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

  @Get('delivery-monitor')
  @Roles('ADS_ADMIN_VIEWER', 'ADS_ADMIN_OPERATOR', 'ADS_OPS_MONITOR', 'ADS_AUDITOR')
  getDeliveryMonitor(
    @Query(new ZodValidationPipe(deliveryMonitorQuerySchema)) query: DeliveryMonitorQueryDto,
  ) {
    return this.deliveryService.getDeliveryMonitor(query);
  }

  @Patch('events/:eventId/billable-status')
  @Roles('ADS_ADMIN_OPERATOR', 'ADS_OPS_MONITOR')
  updateBillableStatus(
    @Param(new ZodValidationPipe(eventIdParamSchema)) params: EventIdParamDto,
    @Body(new ZodValidationPipe(updateBillableStatusSchema)) body: UpdateBillableStatusDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.deliveryService.updateBillableStatus(params.eventId, body, { user, requestId });
  }

  @Get('audit')
  @Roles('ADS_AUDITOR', 'ADS_ADMIN_MANAGER', 'ADS_FINANCE')
  listAudit(@Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQueryDto) {
    return this.auditService.list(query);
  }
}
