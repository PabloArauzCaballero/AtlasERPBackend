import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import {
  B2BAccountModel,
  MerchantBranchModel,
  MerchantInvoiceModel,
  MerchantPlanModel,
  MerchantReceivableModel,
  MerchantSubscriptionModel,
  MerchantUserModel,
} from '../b2b-sales-crm/models/b2b-sales-crm.models';
import { AdvertiserAccountModel, AdvertiserUserModel, CampaignModel } from '../ads/models';
import { AdsModule } from '../ads/ads.module';
import { BusinessActionLogsModule } from '../business-action-logs/business-action-logs.module';
import { PortalController } from './portal.controller';
import { PortalScopeService } from './portal.scope.service';
import { PortalService } from './portal.service';

@Module({
  imports: [
    SequelizeModule.forFeature([
      MerchantPlanModel,
      MerchantSubscriptionModel,
      MerchantBranchModel,
      MerchantUserModel,
      B2BAccountModel,
      MerchantInvoiceModel,
      MerchantReceivableModel,
      AdvertiserAccountModel,
      AdvertiserUserModel,
      CampaignModel,
    ]),
    // El portal reutiliza la auditoría de publicidad (`ad_audit_log`) y la bitácora de acciones
    // de negocio en lugar de mantener rastros paralelos.
    AdsModule,
    BusinessActionLogsModule,
  ],
  controllers: [PortalController],
  providers: [PortalService, PortalScopeService],
  exports: [PortalScopeService],
})
export class PortalModule {}
