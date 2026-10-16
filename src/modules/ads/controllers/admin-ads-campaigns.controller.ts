import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../../common/types/auth-context.types';
import { RequestId } from '../decorators/request-id.decorator';
import { AdminAdsService } from '../services/admin-ads.service';
import { AdsModerationService } from '../services/moderation.service';
import {
  campaignIdParamSchema,
  listCampaignsQuerySchema,
  updateCampaignStatusSchema,
} from '../ads.schemas';
import { submitCampaignForReviewSchema } from '../ads.authoring.schemas';
import type {
  CampaignIdParamDto,
  ListCampaignsQueryDto,
  UpdateCampaignStatusDto,
} from '../ads.dtos';
import type { SubmitCampaignForReviewDto } from '../ads.dtos';

@Controller('admin/ads')
export class AdminAdsCampaignsController {
  constructor(
    private readonly adminAdsService: AdminAdsService,
    private readonly moderationService: AdsModerationService,
  ) {}

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

  /**
   * Envía la campaña a moderación. Es la entrada que faltaba a la cola: sin ella nada creaba
   * revisiones y ninguna campaña podía aprobarse, luego ninguna podía activarse ni entregarse.
   * Lo firma quien gestiona la campaña, no quien la modera: aprobar lo propio vaciaría de sentido
   * la separación que sostiene el circuito.
   */
  @Post('campaigns/:campaignId/submit')
  @Roles('ADS_ADMIN_MANAGER', 'ADS_ADMIN_OPERATOR')
  submitCampaignForReview(
    @Param(new ZodValidationPipe(campaignIdParamSchema)) params: CampaignIdParamDto,
    @Body(new ZodValidationPipe(submitCampaignForReviewSchema)) body: SubmitCampaignForReviewDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.moderationService.submitCampaign(params.campaignId, body, { user, requestId });
  }
}
