import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { adsModels } from './models';
import { AdminAdsController } from './controllers/admin-ads.controller';
import { AdsDeliveryController } from './controllers/ads-delivery.controller';
import { AdvertisersRepository } from './repositories/advertisers.repository';
import { CampaignsRepository } from './repositories/campaigns.repository';
import { ModerationRepository } from './repositories/moderation.repository';
import { InventoryRepository } from './repositories/inventory.repository';
import { PoliciesRepository } from './repositories/policies.repository';
import { BillingRepository } from './repositories/billing.repository';
import { EventsRepository } from './repositories/events.repository';
import { DeliveryRepository } from './repositories/delivery.repository';
import { ReportingRepository } from './repositories/reporting.repository';
import { AuditRepository } from './repositories/audit.repository';
import { AdminAdsService } from './services/admin-ads.service';
import { AdsModerationService } from './services/moderation.service';
import { AdsBillingService } from './services/billing.service';
import { AdsDeliveryService } from './services/delivery.service';
import { AdsAuditService } from './services/audit.service';
import { BusinessActionLogsModule } from '../business-action-logs/business-action-logs.module';
import { EmailMessagingService } from './services/email-messaging.service';
import { EmailMessagingProcessor } from './services/email-messaging.processor';

@Module({
  imports: [SequelizeModule.forFeature(adsModels), BusinessActionLogsModule],
  controllers: [AdminAdsController, AdsDeliveryController],
  providers: [
    AdvertisersRepository,
    CampaignsRepository,
    ModerationRepository,
    InventoryRepository,
    PoliciesRepository,
    BillingRepository,
    EventsRepository,
    DeliveryRepository,
    ReportingRepository,
    AuditRepository,
    AdminAdsService,
    AdsModerationService,
    AdsBillingService,
    AdsDeliveryService,
    AdsAuditService,
    EmailMessagingService,
    EmailMessagingProcessor,
  ],
  exports: [AdminAdsService, AdsDeliveryService],
})
export class AdsModule {}
