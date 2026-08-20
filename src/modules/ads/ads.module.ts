import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { adsModels } from './models';
import { AdminAdsAuthoringController } from './controllers/admin-ads-authoring.controller';
import { AdminAdsController } from './controllers/admin-ads.controller';
import { AdsDeliveryController } from './controllers/ads-delivery.controller';
import { AdvertisersRepository } from './repositories/advertisers.repository';
import { AdsAuthoringRepository } from './repositories/authoring.repository';
import { CampaignsRepository } from './repositories/campaigns.repository';
import { ModerationRepository } from './repositories/moderation.repository';
import { InventoryRepository } from './repositories/inventory.repository';
import { PoliciesRepository } from './repositories/policies.repository';
import { BillingRepository } from './repositories/billing.repository';
import { EventsRepository } from './repositories/events.repository';
import { DeliveryRepository } from './repositories/delivery.repository';
import { ReportingRepository } from './repositories/reporting.repository';
import { AuditRepository } from './repositories/audit.repository';
import { AdsAuthoringService } from './services/authoring.service';
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
  controllers: [AdminAdsAuthoringController, AdminAdsController, AdsDeliveryController],
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
    AdsAuthoringService,
    AdsAuthoringRepository,
    AdsModerationService,
    AdsBillingService,
    AdsDeliveryService,
    AdsAuditService,
    EmailMessagingService,
    EmailMessagingProcessor,
  ],
  // `AdsAuditService` se exporta para que el portal del comercio escriba en `ad_audit_log` con el
  // mismo formato y las mismas garantías transaccionales que la consola administrativa.
  exports: [AdminAdsService, AdsDeliveryService, AdsAuditService],
})
export class AdsModule {}
