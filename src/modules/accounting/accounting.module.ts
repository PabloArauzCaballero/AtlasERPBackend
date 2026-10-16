import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { accountingModels } from '../../database/models';
import { AccountGroupsController } from './account-groups/controllers/account-groups.controller';
import { AccountingDocumentsController } from './documents/controllers/accounting-documents.controller';
import { BillingController } from './billing/controllers/billing.controller';
import { BusinessPartnersController } from './business-partners/controllers/business-partners.controller';
import { ClosingController } from './closing/controllers/closing.controller';
import { ContractsController } from './contracts/controllers/contracts.controller';
import { FinancialStructureCalendarController } from './financial-structure/controllers/financial-structure-calendar.controller';
import { FinancialStructureChartController } from './financial-structure/controllers/financial-structure-chart.controller';
import { FinancialStructureLegalController } from './financial-structure/controllers/financial-structure-legal.controller';
import { FinancialStructureMasterDataController } from './financial-structure/controllers/financial-structure-master-data.controller';
import { ReceiptsController } from './receipts/controllers/receipts.controller';
import { AccountGroupsService } from './account-groups/services/account-groups.service';
import { AccountingDocumentQueries } from './documents/services/accounting-document-queries.service';
import { AccountingDraftService } from './documents/services/accounting-draft.service';
import { AccountingEventOutbox } from './documents/services/accounting-event-outbox.service';
import { AccountingPostingService } from './documents/services/accounting-posting.service';
import { AccountingReversalService } from './documents/services/accounting-reversal.service';
import { DocumentDraftRecorder } from './documents/services/document-draft-recorder.service';
import { DocumentDraftResolver } from './documents/services/document-draft-resolver.service';
import { DocumentApprovalService } from './documents/services/document-approval.service';
import { ArInvoiceFiscalEmission } from './billing/services/ar-invoice-fiscal-emission.service';
import { ArInvoiceIssuanceService } from './billing/services/ar-invoice-issuance.service';
import { ArInvoiceMaintenanceService } from './billing/services/ar-invoice-maintenance.service';
import { ArInvoicePreparation } from './billing/services/ar-invoice-preparation.service';
import { ArInvoiceQueries } from './billing/services/ar-invoice-queries.service';
import { BillingEventsService } from './billing/services/billing-events.service';
import { BusinessPartnersService } from './business-partners/services/business-partners.service';
import { ClosingService } from './closing/services/closing.service';
import { ContractsService } from './contracts/services/contracts.service';
import { BusinessPartnerRoleValidationService } from './business-partners/services/business-partner-role-validation.service';
import { ClosingControlService } from './closing/services/closing-control.service';
import { DoubleEntryValidator } from './posting/validators/double-entry.validator';
import { ChartOfAccountsService } from './financial-structure/services/chart-of-accounts.service';
import { FiscalCalendarService } from './financial-structure/services/fiscal-calendar.service';
import { LegalStructureService } from './financial-structure/services/legal-structure.service';
import { MasterDataListings } from './financial-structure/services/master-data-listings.service';
import { PeriodGuardService } from './posting/services/period-guard.service';
import { SapPostingValidationService } from './posting/services/sap-posting-validation.service';
import { ReceiptsService } from './receipts/services/receipts.service';
import { PostingRuleSnapshotService } from './posting/services/posting-rule-snapshot.service';
import { AccountingDefaultsService } from './shared/services/accounting-defaults.service';
import { LegalEntityAccessService } from '../../common/services/legal-entity-access.service';
import { BusinessActionLogsModule } from '../business-action-logs/business-action-logs.module';
import { FiscalSiatModule } from '../fiscal/siat/fiscal-siat.module';

import { SupplierPaymentTermsController } from './supplier-payment-terms/supplier-payment-terms.controller';
import { SupplierPaymentTermsService } from './supplier-payment-terms/supplier-payment-terms.service';

@Module({
  imports: [
    SequelizeModule.forFeature(accountingModels),
    BusinessActionLogsModule,
    // Documento fiscal de la factura AR. Dependencia mutua con el módulo fiscal: forwardRef.
    forwardRef(() => FiscalSiatModule),
  ],
  controllers: [
    AccountGroupsController,
    AccountingDocumentsController,
    BillingController,
    BusinessPartnersController,
    ClosingController,
    ContractsController,
    FinancialStructureCalendarController,
    FinancialStructureChartController,
    FinancialStructureLegalController,
    FinancialStructureMasterDataController,
    ReceiptsController,
    SupplierPaymentTermsController,
  ],
  providers: [
    AccountGroupsService,
    AccountingDefaultsService,
    AccountingDocumentQueries,
    AccountingDraftService,
    AccountingEventOutbox,
    AccountingPostingService,
    AccountingReversalService,
    DocumentDraftRecorder,
    DocumentDraftResolver,
    DocumentApprovalService,
    BusinessPartnerRoleValidationService,
    ArInvoiceFiscalEmission,
    ArInvoiceIssuanceService,
    ArInvoiceMaintenanceService,
    ArInvoicePreparation,
    ArInvoiceQueries,
    BillingEventsService,
    BusinessPartnersService,
    ClosingService,
    ClosingControlService,
    ContractsService,
    DoubleEntryValidator,
    ChartOfAccountsService,
    FiscalCalendarService,
    LegalStructureService,
    MasterDataListings,
    PeriodGuardService,
    SapPostingValidationService,
    SupplierPaymentTermsService,
    ReceiptsService,
    PostingRuleSnapshotService,
    LegalEntityAccessService,
  ],
  exports: [
    AccountingDocumentQueries,
    AccountingDraftService,
    AccountingPostingService,
    AccountingReversalService,
    /* El puente del CRM comprueba el alcance por entidad ANTES de bloquear la factura (P-06). */
    LegalEntityAccessService,
    DoubleEntryValidator,
    PeriodGuardService,
    SapPostingValidationService,
  ],
})
export class AccountingModule {}
