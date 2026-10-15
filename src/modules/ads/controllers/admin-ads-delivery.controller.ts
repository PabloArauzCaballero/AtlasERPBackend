import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../../common/types/auth-context.types';
import { RequestId } from '../decorators/request-id.decorator';
import { AdsDeliveryService } from '../services/delivery.service';
import {
  deliveryMonitorQuerySchema,
  eventIdParamSchema,
  updateBillableStatusSchema,
} from '../ads.schemas';
import type {
  DeliveryMonitorQueryDto,
  EventIdParamDto,
  UpdateBillableStatusDto,
} from '../ads.dtos';

@Controller('admin/ads')
export class AdminAdsDeliveryController {
  constructor(private readonly deliveryService: AdsDeliveryService) {}

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
}
