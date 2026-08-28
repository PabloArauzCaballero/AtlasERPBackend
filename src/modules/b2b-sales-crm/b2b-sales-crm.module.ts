import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { atlasSalesModels } from './models/b2b-sales-crm.models';
import { creditRatingModels } from './models/credit-rating.models';
import { crmSegmentModels } from './models/crm-segment.model';
import { AccountTagsController } from './controllers/account-tags.controller';
import { ActivitiesController } from './controllers/activities.controller';
import { CatalogsController } from './controllers/catalogs.controller';
import { CatalogsService } from './services/catalogs.service';
import { B2BAccountsController } from './controllers/b2b-accounts.controller';
import { BillingController } from './controllers/billing.controller';
import { BnplController } from './controllers/bnpl.controller';
import { ContractsController } from './controllers/contracts.controller';
import { CreditRatingController } from './controllers/credit-rating.controller';
import { CrmSegmentsController } from './controllers/crm-segments.controller';
import { CoverageController } from './controllers/coverage.controller';
import { OnboardingController } from './controllers/onboarding.controller';
import { OpportunitiesController } from './controllers/opportunities.controller';
import { ProposalsController } from './controllers/proposals.controller';
import { ReconciliationController } from './controllers/reconciliation.controller';
import { B2BSalesCrmRepository } from './repositories/b2b-sales-crm.repository';
import { CrmSegmentsRepository } from './repositories/crm-segments.repository';
import { CreditRatingRepository } from './repositories/credit-rating.repository';
import { AccountTagsService } from './services/account-tags.service';
import { CrmSegmentsService } from './services/crm-segments.service';
import { ActivitiesService } from './services/activities.service';
import { B2BAccountsService } from './services/b2b-accounts.service';
import { B2BBnplBillingService } from './services/b2b-bnpl-billing.service';
import { B2BContractsService } from './services/b2b-contracts.service';
import { B2BCreditRatingService } from './services/b2b-credit-rating.service';
import { B2BCreditRatingQueryService } from './services/b2b-credit-rating-query.service';
import { B2BCoverageService } from './services/b2b-coverage.service';
import { B2BOnboardingService } from './services/b2b-onboarding.service';
import { B2BPipelineService } from './services/b2b-pipeline.service';
import { B2BReconciliationService } from './services/b2b-reconciliation.service';
import { B2BSalesCrmService } from './services/b2b-sales-crm.service';
import { MerchantAccountingBridgeService } from './services/merchant-accounting-bridge.service';
import { BusinessActionLogsModule } from '../business-action-logs/business-action-logs.module';
import { AccountingModule } from '../accounting/accounting.module';
import { PortalModule } from '../portal/portal.module';

@Module({
  imports: [
    SequelizeModule.forFeature([...atlasSalesModels, ...creditRatingModels, ...crmSegmentModels]),
    BusinessActionLogsModule,
    AccountingModule,
    /* Para que el canal del comercio no pueda registrar compras de otra cuenta. */
    PortalModule,
  ],
  controllers: [
    AccountTagsController,
    ActivitiesController,
    CatalogsController,
    B2BAccountsController,
    OpportunitiesController,
    ProposalsController,
    ContractsController,
    OnboardingController,
    BnplController,
    BillingController,
    CoverageController,
    ReconciliationController,
    CreditRatingController,
    CrmSegmentsController,
  ],
  providers: [
    B2BSalesCrmRepository,
    CrmSegmentsRepository,
    AccountTagsService,
    CrmSegmentsService,
    ActivitiesService,
    CatalogsService,
    B2BAccountsService,
    B2BPipelineService,
    B2BContractsService,
    B2BOnboardingService,
    B2BBnplBillingService,
    B2BCoverageService,
    B2BReconciliationService,
    B2BSalesCrmService,
    MerchantAccountingBridgeService,
    CreditRatingRepository,
    B2BCreditRatingService,
    B2BCreditRatingQueryService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [B2BSalesCrmService],
})
export class B2BSalesCrmModule {}
