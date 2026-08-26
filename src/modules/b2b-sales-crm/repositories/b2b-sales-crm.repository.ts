import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Op, Transaction, WhereOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import {
  ApprovalRequestModel,
  AccountTagModel,
  B2BAccountTagModel,
  AuditLogModel,
  InternalUserModel,
  B2BAccountModel,
  B2BContactModel,
  B2BContractModel,
  BNPLInstallmentModel,
  BNPLPurchaseModel,
  CommercialProposalModel,
  CommercialTermModel,
  ConsumerPaymentToMerchantModel,
  ConsumerRecoveryReceivableModel,
  ConsumerRefModel,
  ContractVersionModel,
  MDRRuleModel,
  MerchantBranchModel,
  MerchantInvoiceLineModel,
  MerchantInvoiceModel,
  MerchantOnboardingCaseModel,
  MerchantPayableModel,
  MerchantPaymentAllocationModel,
  MerchantPaymentModel,
  MerchantReceivableModel,
  MerchantUserModel,
  OnboardingChecklistItemModel,
  ProposalLineModel,
  ReconciliationItemModel,
  ReconciliationRunModel,
  SalesOpportunityModel,
} from '../models/b2b-sales-crm.models';

@Injectable()
export class B2BSalesCrmRepository {
  constructor(
    @InjectConnection() readonly sequelize: Sequelize,
    @InjectModel(InternalUserModel) readonly internalUsers: typeof InternalUserModel,
    @InjectModel(B2BAccountModel) readonly accounts: typeof B2BAccountModel,
    @InjectModel(AccountTagModel) readonly accountTags: typeof AccountTagModel,
    @InjectModel(B2BAccountTagModel) readonly accountTagLinks: typeof B2BAccountTagModel,
    @InjectModel(B2BContactModel) readonly contacts: typeof B2BContactModel,
    @InjectModel(SalesOpportunityModel) readonly opportunities: typeof SalesOpportunityModel,
    @InjectModel(CommercialProposalModel) readonly proposals: typeof CommercialProposalModel,
    @InjectModel(ProposalLineModel) readonly proposalLines: typeof ProposalLineModel,
    @InjectModel(ApprovalRequestModel) readonly approvalRequests: typeof ApprovalRequestModel,
    @InjectModel(B2BContractModel) readonly contracts: typeof B2BContractModel,
    @InjectModel(ContractVersionModel) readonly contractVersions: typeof ContractVersionModel,
    @InjectModel(CommercialTermModel) readonly commercialTerms: typeof CommercialTermModel,
    @InjectModel(MDRRuleModel) readonly mdrRules: typeof MDRRuleModel,
    @InjectModel(MerchantBranchModel) readonly branches: typeof MerchantBranchModel,
    @InjectModel(MerchantUserModel) readonly merchantUsers: typeof MerchantUserModel,
    @InjectModel(MerchantOnboardingCaseModel)
    readonly onboardingCases: typeof MerchantOnboardingCaseModel,
    @InjectModel(OnboardingChecklistItemModel)
    readonly checklistItems: typeof OnboardingChecklistItemModel,
    @InjectModel(ConsumerRefModel) readonly consumers: typeof ConsumerRefModel,
    @InjectModel(BNPLPurchaseModel) readonly purchases: typeof BNPLPurchaseModel,
    @InjectModel(BNPLInstallmentModel) readonly installments: typeof BNPLInstallmentModel,
    @InjectModel(ConsumerPaymentToMerchantModel)
    readonly consumerPaymentsToMerchant: typeof ConsumerPaymentToMerchantModel,
    @InjectModel(MerchantReceivableModel) readonly receivables: typeof MerchantReceivableModel,
    @InjectModel(MerchantInvoiceModel) readonly invoices: typeof MerchantInvoiceModel,
    @InjectModel(MerchantInvoiceLineModel) readonly invoiceLines: typeof MerchantInvoiceLineModel,
    @InjectModel(MerchantPaymentModel) readonly payments: typeof MerchantPaymentModel,
    @InjectModel(MerchantPaymentAllocationModel)
    readonly paymentAllocations: typeof MerchantPaymentAllocationModel,
    @InjectModel(MerchantPayableModel) readonly payables: typeof MerchantPayableModel,
    @InjectModel(ConsumerRecoveryReceivableModel)
    readonly recoveries: typeof ConsumerRecoveryReceivableModel,
    @InjectModel(ReconciliationRunModel) readonly reconciliationRuns: typeof ReconciliationRunModel,
    @InjectModel(ReconciliationItemModel)
    readonly reconciliationItems: typeof ReconciliationItemModel,
    @InjectModel(AuditLogModel) readonly auditLogs: typeof AuditLogModel,
    private readonly logger: PinoLoggerService,
  ) {}

  private withTransaction<TOptions extends object>(
    options: TOptions,
    transaction?: Transaction,
  ): TOptions & { transaction?: Transaction } {
    return transaction ? { ...options, transaction } : options;
  }

  async transaction<T>(callback: (transaction: Transaction) => Promise<T>): Promise<T> {
    const transactionId = randomUUID();
    const startedAt = Date.now();

    this.logger.debugContext(B2BSalesCrmRepository.name, 'Database transaction started', {
      transactionId,
    });

    try {
      const result = await this.sequelize.transaction(callback);
      this.logger.infoContext(B2BSalesCrmRepository.name, 'Database transaction committed', {
        transactionId,
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      this.logger.errorContext(B2BSalesCrmRepository.name, 'Database transaction rolled back', {
        transactionId,
        durationMs: Date.now() - startedAt,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  findAccountDuplicate(
    taxId: string | undefined,
    tradeName: string,
    transaction?: Transaction,
  ): Promise<B2BAccountModel | null> {
    this.logger.debugContext(
      B2BSalesCrmRepository.name,
      'Searching possible duplicate B2B account',
      {
        hasTaxId: Boolean(taxId),
        tradeName,
      },
    );

    const conditions = taxId
      ? [{ taxId }, { tradeName: { [Op.iLike]: tradeName } }]
      : [{ tradeName: { [Op.iLike]: tradeName } }];

    return this.accounts.findOne(
      this.withTransaction({ where: { [Op.or]: conditions } }, transaction),
    );
  }

  async audit(
    input: {
      entityName: string;
      entityId: string;
      action: string;
      changedByUserId?: string;
      oldValues?: Record<string, unknown> | null;
      newValues?: Record<string, unknown> | null;
    },
    transaction?: Transaction,
  ): Promise<void> {
    this.logger.infoContext(B2BSalesCrmRepository.name, 'Writing audit log entry', {
      entityName: input.entityName,
      entityId: input.entityId,
      action: input.action,
      changedByUserId: input.changedByUserId,
    });

    await this.auditLogs.create(
      {
        entityName: input.entityName,
        entityId: input.entityId,
        action: input.action,
        changedByUserId: input.changedByUserId ?? null,
        oldValues: input.oldValues ?? null,
        newValues: input.newValues ?? null,
      },
      this.withTransaction({}, transaction),
    );
  }

  listAccounts(input: {
    offset: number;
    limit: number;
    status?: string;
    search?: string;
    category?: string;
    businessLine?: string;
    tag?: string;
    includeArchived?: boolean;
    sortBy: string;
    sortOrder: 'ASC' | 'DESC';
  }): Promise<{ rows: B2BAccountModel[]; count: number }> {
    const whereParts: WhereOptions[] = [];

    // Una cuenta archivada sigue existiendo; solo se oculta de los listados salvo que se pida verla.
    if (!input.includeArchived) {
      whereParts.push({ archivedAt: null });
    }

    if (input.status) {
      whereParts.push({ lifecycleStatus: input.status });
    }
    if (input.category) whereParts.push({ category: { [Op.iLike]: input.category } });
    if (input.businessLine) whereParts.push({ businessLine: { [Op.iLike]: input.businessLine } });

    if (input.search) {
      whereParts.push({
        [Op.or]: [
          { legalName: { [Op.iLike]: `%${input.search}%` } },
          { tradeName: { [Op.iLike]: `%${input.search}%` } },
          { taxId: { [Op.iLike]: `%${input.search}%` } },
          { category: { [Op.iLike]: `%${input.search}%` } },
          { businessLine: { [Op.iLike]: `%${input.search}%` } },
          { city: { [Op.iLike]: `%${input.search}%` } },
        ],
      });
    }

    const where: WhereOptions = whereParts.length > 0 ? { [Op.and]: whereParts } : {};

    this.logger.debugContext(B2BSalesCrmRepository.name, 'Listing B2B accounts from repository', {
      offset: input.offset,
      limit: input.limit,
      sortBy: input.sortBy,
      sortOrder: input.sortOrder,
      hasStatusFilter: Boolean(input.status),
      hasSearchFilter: Boolean(input.search),
    });

    return this.accounts.findAndCountAll({
      distinct: true,
      include: [
        {
          model: this.accountTags,
          attributes: ['id', 'name'],
          through: { attributes: [] },
          ...(input.tag ? { required: true, where: { name: { [Op.iLike]: input.tag } } } : {}),
        },
      ],
      where,
      offset: input.offset,
      limit: input.limit,
      order: [[input.sortBy, input.sortOrder]],
    });
  }

  findActiveContractVersion(
    accountId: string,
    atDate: string,
    transaction?: Transaction,
  ): Promise<ContractVersionModel | null> {
    return this.contractVersions.findOne({
      include: [
        {
          model: this.contracts,
          required: true,
          where: { accountId, status: 'ACTIVE' },
        },
        { model: this.commercialTerms, required: false },
        { model: this.mdrRules, required: false, where: { isActive: true } },
      ],
      where: {
        status: 'ACTIVE',
        validFrom: { [Op.lte]: atDate },
        [Op.or]: [{ validTo: null }, { validTo: { [Op.gte]: atDate } }],
      },
      ...this.withTransaction({}, transaction),
      order: [['validFrom', 'DESC']],
    });
  }

  findProposalWithLines(
    id: string,
    transaction?: Transaction,
  ): Promise<CommercialProposalModel | null> {
    return this.proposals.findByPk(
      id,
      this.withTransaction({ include: [this.proposalLines] }, transaction),
    );
  }

  findInvoiceWithLines(
    id: string,
    transaction?: Transaction,
  ): Promise<MerchantInvoiceModel | null> {
    return this.invoices.findByPk(
      id,
      this.withTransaction({ include: [this.invoiceLines] }, transaction),
    );
  }

  findPurchaseWithInstallments(
    id: string,
    transaction?: Transaction,
  ): Promise<BNPLPurchaseModel | null> {
    return this.purchases.findByPk(
      id,
      this.withTransaction({ include: [this.installments] }, transaction),
    );
  }

  findReconciliationRunWithItems(
    id: string,
    transaction?: Transaction,
  ): Promise<ReconciliationRunModel | null> {
    return this.reconciliationRuns.findByPk(
      id,
      this.withTransaction({ include: [this.reconciliationItems] }, transaction),
    );
  }
}
