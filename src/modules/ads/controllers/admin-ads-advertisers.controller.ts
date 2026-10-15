import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../../common/types/auth-context.types';
import { RequestId } from '../decorators/request-id.decorator';
import { AdminAdsService } from '../services/admin-ads.service';
import {
  advertiserIdParamSchema,
  bulkCreateAdvertisersSchema,
  createAdvertiserSchema,
  createBillingProfileSchema,
  listAdvertisersQuerySchema,
  updateAdvertiserStatusSchema,
} from '../ads.schemas';
import type {
  AdvertiserIdParamDto,
  BulkCreateAdvertisersDto,
  CreateAdvertiserDto,
  CreateBillingProfileDto,
  ListAdvertisersQueryDto,
  UpdateAdvertiserStatusDto,
} from '../ads.dtos';

@Controller('admin/ads')
export class AdminAdsAdvertisersController {
  constructor(private readonly adminAdsService: AdminAdsService) {}

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
}
