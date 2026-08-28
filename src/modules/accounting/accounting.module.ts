import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { accountingModels } from '../../database/models';
import { AccountGroupsController } from './account-groups/controllers/account-groups.controller';
import { AccountingDocumentsController } from './documents/controllers/accounting-documents.controller';
import { BillingController } from './billing/controllers/billing.controller';
import { BusinessPartnersController } from './business-partners/controllers/business-partners.controller';
import { ClosingController } from './closing/controllers/closing.controller';
import { ContractsController } from './contracts/controllers/contracts.controller';
import { FinancialStructureController } from './financial-structure/controllers/financial-structure.controller';
import { ReceiptsController } from './receipts/controllers/receipts.controller';
import { AccountGroupsService } from './account-groups/services/account-groups.service';
import { AccountingDocumentsService } from './documents/services/accounting-documents.service';
import { BillingService } from './billing/services/billing.service';
import { BusinessPartnersService } from './business-partners/services/business-partners.service';
import { ClosingService } from './closing/services/closing.service';
import { ContractsService } from './contracts/services/contracts.service';
import { BusinessPartnerRoleValidationService } from './business-partners/services/business-partner-role-validation.service';
import { ClosingControlService } from './closing/services/closing-control.service';
import { DoubleEntryValidator } from './posting/validators/double-entry.validator';
import { FinancialStructureService } from './financial-structure/services/financial-structure.service';
import { PeriodGuardService } from './posting/services/period-guard.service';
import { SapPostingValidationService } from './posting/services/sap-posting-validation.service';
import { ReceiptsService } from './receipts/services/receipts.service';
import { PostingRuleSnapshotService } from './posting/services/posting-rule-snapshot.service';
import { LegalEntityAccessService } from '../../common/services/legal-entity-access.service';
import { BusinessActionLogsModule } from '../business-action-logs/business-action-logs.module';

import { SupplierPaymentTermsController } from './supplier-payment-terms/supplier-payment-terms.controller';
import { SupplierPaymentTermsService } from './supplier-payment-terms/supplier-payment-terms.service';

@Module({
  imports: [SequelizeModule.forFeature(accountingModels), BusinessActionLogsModule],
  controllers: [
    AccountGroupsController,
    AccountingDocumentsController,
    BillingController,
    BusinessPartnersController,
    ClosingController,
    ContractsController,
    FinancialStructureController,
    ReceiptsController,
    SupplierPaymentTermsController,
  ],
  providers: [
    AccountGroupsService,
    AccountingDocumentsService,
    BusinessPartnerRoleValidationService,
    BillingService,
    BusinessPartnersService,
    ClosingService,
    ClosingControlService,
    ContractsService,
    DoubleEntryValidator,
    FinancialStructureService,
    PeriodGuardService,
    SapPostingValidationService,
    SupplierPaymentTermsService,
    ReceiptsService,
    PostingRuleSnapshotService,
    LegalEntityAccessService,
  ],
  exports: [
    AccountingDocumentsService,
    DoubleEntryValidator,
    PeriodGuardService,
    SapPostingValidationService,
  ],
})
export class AccountingModule {}
