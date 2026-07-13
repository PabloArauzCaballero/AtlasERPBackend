import { Body, Controller, Post } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { AdsDeliveryService } from '../services/delivery.service';
import { bulkTrackEventsSchema, deliveryRequestSchema, trackEventSchema } from '../ads.schemas';
import type { BulkTrackEventsDto, DeliveryRequestDto, TrackEventDto } from '../ads.dtos';

@Controller('ads')
export class AdsDeliveryController {
  constructor(
    private readonly deliveryService: AdsDeliveryService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AdsDeliveryController.name);
  }

  @Post('delivery/select')
  @Roles('ADS_AD_SERVER')
  selectAd(@Body(new ZodValidationPipe(deliveryRequestSchema)) body: DeliveryRequestDto) {
    this.logger.debug({ placementCode: body.placementCode }, 'Delivery select requested');
    return this.deliveryService.selectAd(body);
  }

  @Post('events/bulk')
  @Roles('ADS_EVENT_TRACKER', 'ADS_AD_SERVER')
  trackEventsBulk(@Body(new ZodValidationPipe(bulkTrackEventsSchema)) body: BulkTrackEventsDto) {
    return this.deliveryService.trackEventsBulk(body);
  }

  @Post('events')
  @Roles('ADS_EVENT_TRACKER', 'ADS_AD_SERVER')
  trackEvent(@Body(new ZodValidationPipe(trackEventSchema)) body: TrackEventDto) {
    return this.deliveryService.trackEvent(body);
  }
}
