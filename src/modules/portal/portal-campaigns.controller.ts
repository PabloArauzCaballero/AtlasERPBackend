import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../common/types/auth-context.types';
import { RequestId } from '../ads/decorators/request-id.decorator';
import { PortalCampaignCommandService } from './commands/portal-campaign-commands.service';
import { buildPortalActor } from './portal-actor';
import { PORTAL_ROLES } from './portal.constants';
import { PortalScopeService } from './portal.scope.service';
import { PortalMerchantQueryService } from './queries/portal-merchant-query.service';
import {
  AdvertisersQueryDto,
  CampaignsQueryDto,
  IdParamsDto,
  SetCampaignStatusDto,
  advertisersQuerySchema,
  campaignsQuerySchema,
  idParamsSchema,
  setCampaignStatusSchema,
} from './portal.schemas';

/** Anunciantes y campañas del comercio: `portal/advertisers` y `portal/campaigns`. */
@Controller('portal')
export class PortalCampaignsController {
  constructor(
    private readonly scopeService: PortalScopeService,
    private readonly merchant: PortalMerchantQueryService,
    private readonly campaigns: PortalCampaignCommandService,
  ) {}

  @Roles(...PORTAL_ROLES)
  @Get('advertisers')
  async listAdvertisers(
    @Query(new ZodValidationPipe(advertisersQuerySchema)) query: AdvertisersQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scope = await this.scopeService.resolveScope(user);
    return this.merchant.listAdvertisers(scope, query);
  }

  @Roles(...PORTAL_ROLES)
  @Get('campaigns')
  async listCampaigns(
    @Query(new ZodValidationPipe(campaignsQuerySchema)) query: CampaignsQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scope = await this.scopeService.resolveScope(user);
    return this.merchant.listCampaigns(scope, query);
  }

  @Roles(...PORTAL_ROLES)
  @Patch('campaigns/:id/status')
  async setCampaignStatus(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Body(new ZodValidationPipe(setCampaignStatusSchema)) body: SetCampaignStatusDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.campaigns.setCampaignStatus(
      params.id,
      body,
      await buildPortalActor(this.scopeService, user, requestId),
    );
  }
}
