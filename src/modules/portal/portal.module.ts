import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import {
  B2BAccountModel,
  MerchantBranchModel,
  MerchantInvoiceModel,
  MerchantPlanModel,
  MerchantReceivableModel,
  MerchantSubscriptionModel,
} from '../b2b-sales-crm/models/b2b-sales-crm.models';
import { AdvertiserAccountModel, CampaignModel } from '../ads/models';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';

@Module({
  imports: [
    SequelizeModule.forFeature([
      MerchantPlanModel,
      MerchantSubscriptionModel,
      MerchantBranchModel,
      B2BAccountModel,
      MerchantInvoiceModel,
      MerchantReceivableModel,
      AdvertiserAccountModel,
      CampaignModel,
    ]),
  ],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
