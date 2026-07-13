import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { atlasSalesModels } from './models/b2b-sales-crm.models';
import { ActivitiesController } from './controllers/activities.controller';
import { CatalogsController } from './controllers/catalogs.controller';
import { CatalogsService } from './services/catalogs.service';
import { B2BAccountsController } from './controllers/b2b-accounts.controller';
import { BillingController } from './controllers/billing.controller';
import { BnplController } from './controllers/bnpl.controller';
import { ContractsController } from './controllers/contracts.controller';
import { CoverageController } from './controllers/coverage.controller';
import { OnboardingController } from './controllers/onboarding.controller';
import { OpportunitiesController } from './controllers/opportunities.controller';
import { ProposalsController } from './controllers/proposals.controller';
import { ReconciliationController } from './controllers/reconciliation.controller';
import { B2BSalesCrmRepository } from './repositories/b2b-sales-crm.repository';
import { ActivitiesService } from './services/activities.service';
import { B2BAccountsService } from './services/b2b-accounts.service';
import { B2BBnplBillingService } from './services/b2b-bnpl-billing.service';
import { B2BContractsService } from './services/b2b-contracts.service';
import { B2BCoverageService } from './services/b2b-coverage.service';
import { B2BOnboardingService } from './services/b2b-onboarding.service';
import { B2BPipelineService } from './services/b2b-pipeline.service';
import { B2BReconciliationService } from './services/b2b-reconciliation.service';
import { B2BSalesCrmService } from './services/b2b-sales-crm.service';
import { MerchantAccountingBridgeService } from './services/merchant-accounting-bridge.service';
import { BusinessActionLogsModule } from '../business-action-logs/business-action-logs.module';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [SequelizeModule.forFeature(atlasSalesModels), BusinessActionLogsModule, AccountingModule],
  controllers: [
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
  ],
  providers: [
    B2BSalesCrmRepository,
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
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [B2BSalesCrmService],
})
export class B2BSalesCrmModule {}
