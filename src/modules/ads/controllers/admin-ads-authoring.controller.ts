import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../../common/types/auth-context.types';
import { RequestId } from '../decorators/request-id.decorator';
import { AdsAuthoringService } from '../services/authoring.service';
import { AdminAdsService } from '../services/admin-ads.service';
import {
  adSetIdParamSchema,
  campaignPerformanceQuerySchema,
  createAdSchema,
  createAdSetSchema,
  createCampaignSchema,
  createCreativeSchema,
} from '../ads.authoring.schemas';
import {
  createTargetSegmentSchema,
  listTargetSegmentsQuerySchema,
} from '../ads.segmentation.schemas';
import { campaignIdParamSchema } from '../ads.schemas';
import type {
  AdSetIdParamDto,
  CampaignIdParamDto,
  CampaignPerformanceQueryDto,
  CreateAdDto,
  CreateAdSetDto,
  CreateCampaignDto,
  CreateCreativeDto,
  CreateTargetSegmentDto,
  ListTargetSegmentsQueryDto,
} from '../ads.dtos';

/**
 * Alta de la cadena publicitaria y consulta de su desempeño.
 *
 * Controlador aparte de `AdminAdsController` porque son dos superficies con vidas distintas:
 * aquélla administra lo que ya existe —moderar, facturar, suspender— y ésta CREA. Mezclarlas
 * habría dejado un archivo de más de quinientas líneas donde la mitad de las rutas son de lectura
 * y encontrar la que crea una campaña exige leerlo entero.
 *
 * Los roles siguen el reparto del módulo: crear es de `MANAGER`/`OPERATOR`, los segmentos añaden
 * `COMPLIANCE_ADMIN` —una definición de segmento es una política de a quién se le muestra
 * publicidad, no un parámetro de campaña— y leer desempeño alcanza también a `VIEWER` y `AUDITOR`.
 */
@Controller('admin/ads')
export class AdminAdsAuthoringController {
  constructor(
    private readonly authoringService: AdsAuthoringService,
    private readonly adminAdsService: AdminAdsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AdminAdsAuthoringController.name);
  }

  @Post('campaigns')
  @Roles('ADS_ADMIN_MANAGER', 'ADS_ADMIN_OPERATOR')
  createCampaign(
    @Body(new ZodValidationPipe(createCampaignSchema)) body: CreateCampaignDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.authoringService.createCampaign(body, { user, requestId });
  }

  @Post('campaigns/:campaignId/ad-sets')
  @Roles('ADS_ADMIN_MANAGER', 'ADS_ADMIN_OPERATOR')
  createAdSet(
    @Param(new ZodValidationPipe(campaignIdParamSchema)) params: CampaignIdParamDto,
    @Body(new ZodValidationPipe(createAdSetSchema)) body: CreateAdSetDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.authoringService.createAdSet(params.campaignId, body, { user, requestId });
  }

  @Post('creatives')
  @Roles('ADS_ADMIN_MANAGER', 'ADS_ADMIN_OPERATOR')
  createCreative(
    @Body(new ZodValidationPipe(createCreativeSchema)) body: CreateCreativeDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.authoringService.createCreative(body, { user, requestId });
  }

  @Post('ad-sets/:adSetId/ads')
  @Roles('ADS_ADMIN_MANAGER', 'ADS_ADMIN_OPERATOR')
  createAd(
    @Param(new ZodValidationPipe(adSetIdParamSchema)) params: AdSetIdParamDto,
    @Body(new ZodValidationPipe(createAdSchema)) body: CreateAdDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.authoringService.createAd(params.adSetId, body, { user, requestId });
  }

  @Post('segments')
  @Roles('ADS_ADMIN_MANAGER', 'ADS_ADMIN_OPERATOR', 'ADS_COMPLIANCE_ADMIN')
  createSegment(
    @Body(new ZodValidationPipe(createTargetSegmentSchema)) body: CreateTargetSegmentDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.authoringService.createSegment(body, { user, requestId });
  }

  @Get('segments')
  @Roles(
    'ADS_ADMIN_VIEWER',
    'ADS_ADMIN_MANAGER',
    'ADS_ADMIN_OPERATOR',
    'ADS_COMPLIANCE_ADMIN',
    'ADS_AUDITOR',
  )
  listSegments(
    @Query(new ZodValidationPipe(listTargetSegmentsQuerySchema)) query: ListTargetSegmentsQueryDto,
  ) {
    return this.authoringService.listSegments(query);
  }

  @Get('campaigns/:campaignId/performance')
  @Roles('ADS_ADMIN_VIEWER', 'ADS_ADMIN_MANAGER', 'ADS_ADMIN_OPERATOR', 'ADS_AUDITOR')
  getCampaignPerformance(
    @Param(new ZodValidationPipe(campaignIdParamSchema)) params: CampaignIdParamDto,
    @Query(new ZodValidationPipe(campaignPerformanceQuerySchema))
    query: CampaignPerformanceQueryDto,
  ) {
    return this.adminAdsService.getCampaignPerformance(params.campaignId, query);
  }
}
