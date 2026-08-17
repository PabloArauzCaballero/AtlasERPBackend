import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../common/types/auth-context.types';
import { PortalService } from './portal.service';
import {
  BranchesQueryDto,
  CampaignsQueryDto,
  CreatePlanDto,
  IdParamsDto,
  SetCampaignStatusDto,
  SubscribeDto,
  SubscriptionQueryDto,
  branchesQuerySchema,
  campaignsQuerySchema,
  createPlanSchema,
  idParamsSchema,
  setCampaignStatusSchema,
  subscribeSchema,
  subscriptionQuerySchema,
} from './portal.schemas';

const MERCHANT_ROLES = [
  'MERCHANT_ADMIN',
  'COMMERCIAL_MANAGER',
  'COMMERCIAL_EXECUTIVE',
  'ADMIN',
] as const;

@Controller('portal')
export class PortalController {
  constructor(private readonly service: PortalService) {}

  @Roles(...MERCHANT_ROLES)
  @Get('plans')
  listPlans() {
    return this.service.listPlans();
  }

  @Roles('ADMIN', 'COMMERCIAL_MANAGER')
  @Post('plans')
  createPlan(@Body(new ZodValidationPipe(createPlanSchema)) body: CreatePlanDto) {
    return this.service.createPlan(body);
  }

  @Roles(...MERCHANT_ROLES)
  @Get('subscription')
  getSubscription(
    @Query(new ZodValidationPipe(subscriptionQuerySchema)) query: SubscriptionQueryDto,
  ) {
    return this.service.getSubscription(query.merchantAccountId);
  }

  @Roles(...MERCHANT_ROLES)
  @Post('subscription')
  subscribe(
    @Body(new ZodValidationPipe(subscribeSchema)) body: SubscribeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.subscribe(body, user);
  }

  @Roles(...MERCHANT_ROLES)
  @Get('branches')
  listBranches(@Query(new ZodValidationPipe(branchesQuerySchema)) query: BranchesQueryDto) {
    return this.service.listBranches(query);
  }

  @Roles(...MERCHANT_ROLES)
  @Get('billing')
  getBilling(@Query(new ZodValidationPipe(subscriptionQuerySchema)) query: SubscriptionQueryDto) {
    return this.service.getBillingPanel(query.merchantAccountId);
  }

  @Roles(...MERCHANT_ROLES)
  @Get('advertisers')
  listAdvertisers() {
    return this.service.listAdvertisers();
  }

  @Roles(...MERCHANT_ROLES)
  @Get('campaigns')
  listCampaigns(@Query(new ZodValidationPipe(campaignsQuerySchema)) query: CampaignsQueryDto) {
    return this.service.listCampaigns(query.advertiserId);
  }

  @Roles(...MERCHANT_ROLES)
  @Patch('campaigns/:id/status')
  setCampaignStatus(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Body(new ZodValidationPipe(setCampaignStatusSchema)) body: SetCampaignStatusDto,
  ) {
    return this.service.setCampaignStatus(params.id, body.status);
  }
}
