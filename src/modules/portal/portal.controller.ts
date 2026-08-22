import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../common/types/auth-context.types';
import { RequestId } from '../ads/decorators/request-id.decorator';
import { PORTAL_PLAN_ADMIN_ROLES, PORTAL_ROLES } from './portal.constants';
import { PortalService, type PortalActor } from './portal.service';
import {
  AdvertisersQueryDto,
  BranchesQueryDto,
  CampaignsQueryDto,
  CreatePlanDto,
  IdParamsDto,
  PlansQueryDto,
  SetCampaignStatusDto,
  SubscribeDto,
  SubscriptionQueryDto,
  advertisersQuerySchema,
  branchesQuerySchema,
  campaignsQuerySchema,
  createPlanSchema,
  idParamsSchema,
  plansQuerySchema,
  setCampaignStatusSchema,
  subscribeSchema,
  subscriptionQuerySchema,
} from './portal.schemas';

/**
 * Portal del comercio (usuario partner).
 *
 * `@Roles` solo decide *quién es* el llamador; *qué puede tocar* lo decide siempre
 * `PortalScopeService` a partir de sus membresías reales. Ningún handler pasa un identificador
 * del cliente directamente a la capa de datos.
 */
@Controller('portal')
export class PortalController {
  constructor(private readonly service: PortalService) {}

  @Roles(...PORTAL_ROLES)
  @Get('plans')
  async listPlans(@Query(new ZodValidationPipe(plansQuerySchema)) query: PlansQueryDto) {
    return this.service.listPlans(query);
  }

  @Roles(...PORTAL_PLAN_ADMIN_ROLES)
  @Post('plans')
  async createPlan(
    @Body(new ZodValidationPipe(createPlanSchema)) body: CreatePlanDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.service.createPlan(body, await this.buildActor(user, requestId));
  }

  @Roles(...PORTAL_ROLES)
  @Get('subscription')
  async getSubscription(
    @Query(new ZodValidationPipe(subscriptionQuerySchema)) query: SubscriptionQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scope = await this.service.resolveScope(user);
    return this.service.getSubscription(scope, query.merchantAccountId);
  }

  @Roles(...PORTAL_ROLES)
  @Post('subscription')
  async subscribe(
    @Body(new ZodValidationPipe(subscribeSchema)) body: SubscribeDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.service.subscribe(body, await this.buildActor(user, requestId));
  }

  @Roles(...PORTAL_ROLES)
  @Get('branches')
  async listBranches(
    @Query(new ZodValidationPipe(branchesQuerySchema)) query: BranchesQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scope = await this.service.resolveScope(user);
    return this.service.listBranches(scope, query);
  }

  @Roles(...PORTAL_ROLES)
  @Get('billing')
  async getBilling(
    @Query(new ZodValidationPipe(subscriptionQuerySchema)) query: SubscriptionQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scope = await this.service.resolveScope(user);
    return this.service.getBillingPanel(scope, query.merchantAccountId);
  }

  @Roles(...PORTAL_ROLES)
  @Get('advertisers')
  async listAdvertisers(
    @Query(new ZodValidationPipe(advertisersQuerySchema)) query: AdvertisersQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scope = await this.service.resolveScope(user);
    return this.service.listAdvertisers(scope, query);
  }

  @Roles(...PORTAL_ROLES)
  @Get('campaigns')
  async listCampaigns(
    @Query(new ZodValidationPipe(campaignsQuerySchema)) query: CampaignsQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scope = await this.service.resolveScope(user);
    return this.service.listCampaigns(scope, query);
  }

  @Roles(...PORTAL_ROLES)
  @Patch('campaigns/:id/status')
  async setCampaignStatus(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Body(new ZodValidationPipe(setCampaignStatusSchema)) body: SetCampaignStatusDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.service.setCampaignStatus(params.id, body, await this.buildActor(user, requestId));
  }

  private async buildActor(user: AuthUser, requestId: string): Promise<PortalActor> {
    return { user, requestId, scope: await this.service.resolveScope(user) };
  }
}
