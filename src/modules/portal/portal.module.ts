import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import {
  B2BAccountModel,
  BillingProductModel,
  MerchantBranchModel,
  MerchantInvoiceLineModel,
  MerchantInvoiceModel,
  MerchantPlanModel,
  MerchantReceivableModel,
  MerchantSubscriptionModel,
  MerchantUserModel,
} from '../b2b-sales-crm/models/b2b-sales-crm.models';
import { AdvertiserAccountModel, AdvertiserUserModel, CampaignModel } from '../ads/models';
import { AdsModule } from '../ads/ads.module';
import { BusinessActionLogsModule } from '../business-action-logs/business-action-logs.module';
import { ElectronicTaxDocumentModel } from '../../database/models';
import { FiscalSiatModule } from '../fiscal/siat/fiscal-siat.module';
import { PortalBillingController } from './portal-billing.controller';
import { PortalBranchesController } from './portal-branches.controller';
import { PortalCampaignsController } from './portal-campaigns.controller';
import { PortalInvoicesController } from './portal-invoices.controller';
import { PortalPlansController } from './portal-plans.controller';
import { PortalController } from './portal.controller';
import { PortalFiscalService } from './portal-fiscal.service';
import { PortalScopeService } from './portal.scope.service';
import { PortalBranchCommandService } from './commands/portal-branch-commands.service';
import { PortalCampaignCommandService } from './commands/portal-campaign-commands.service';
import { PortalPlanCommandService } from './commands/portal-plan-commands.service';
import { PortalSubscriptionCommandService } from './commands/portal-subscription-commands.service';
import { PortalBillingQueryService } from './queries/portal-billing-query.service';
import { PortalCatalogQueryService } from './queries/portal-catalog-query.service';
import { PortalMerchantQueryService } from './queries/portal-merchant-query.service';

@Module({
  imports: [
    SequelizeModule.forFeature([
      MerchantPlanModel,
      BillingProductModel,
      MerchantSubscriptionModel,
      MerchantBranchModel,
      MerchantUserModel,
      B2BAccountModel,
      MerchantInvoiceLineModel,
      MerchantInvoiceModel,
      MerchantReceivableModel,
      AdvertiserAccountModel,
      AdvertiserUserModel,
      CampaignModel,
      ElectronicTaxDocumentModel,
    ]),
    // El portal reutiliza la auditoría de publicidad (`ad_audit_log`) y la bitácora de acciones
    // de negocio en lugar de mantener rastros paralelos.
    AdsModule,
    BusinessActionLogsModule,
    // La factura fiscal (PDF y XML) que el comercio descarga de su portal.
    FiscalSiatModule,
  ],
  controllers: [
    PortalController,
    PortalPlansController,
    PortalBillingController,
    PortalInvoicesController,
    PortalBranchesController,
    PortalCampaignsController,
  ],
  providers: [
    PortalScopeService,
    PortalFiscalService,
    PortalCatalogQueryService,
    PortalBillingQueryService,
    PortalMerchantQueryService,
    PortalPlanCommandService,
    PortalSubscriptionCommandService,
    PortalBranchCommandService,
    PortalCampaignCommandService,
  ],
  exports: [PortalScopeService],
})
export class PortalModule {}
