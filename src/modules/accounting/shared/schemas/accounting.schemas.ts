import { z } from 'zod';

const uuid = z.string().uuid();
const dateLike = z.coerce.date();
const currency = z.string().length(3).default('BOB');
const money = z.coerce.number().finite().multipleOf(0.01);
const positiveMoney = money.positive();

export const idParamsSchema = z.object({ id: uuid });

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const recordStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']);
export const glAccountTypeEnum = z.enum([
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'EXPENSE',
  'CONTRA_ASSET',
]);
export const partnerTypeEnum = z.enum(['PERSON', 'COMPANY', 'BANK', 'GROUP_ENTITY']);
export const kybStatusEnum = z.enum(['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED']);

export const statementTypeEnum = z.enum([
  'BALANCE_SHEET',
  'INCOME_STATEMENT',
  'CASH_FLOW',
  'EQUITY_CHANGES',
  'MEMORANDUM',
]);
export const accountClassificationEnum = z.enum([
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'EXPENSE',
]);
export const entityLinkTypeEnum = z.enum([
  'BUSINESS_PARTNER',
  'COST_CENTER',
  'PROFIT_CENTER',
  'CONTRACT',
  'LEGAL_ENTITY',
  'TAX_CODE',
  'BANK_ACCOUNT',
  'LEDGER',
  'BRANCH',
  'ACCOUNTING_DOCUMENT',
  'OTHER',
]);

export const createGlAccountGroupSchema = z.object({
  coaId: uuid,
  parentGroupId: uuid.optional(),
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(160),
  statementType: statementTypeEnum,
  classification: accountClassificationEnum,
  subClassification: z.string().min(1).max(40).optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const updateGlAccountGroupSchema = z
  .object({
    parentGroupId: uuid.nullable().optional(),
    name: z.string().min(1).max(160).optional(),
    statementType: statementTypeEnum.optional(),
    classification: accountClassificationEnum.optional(),
    subClassification: z.string().max(40).nullable().optional(),
    sortOrder: z.coerce.number().int().min(0).optional(),
    status: recordStatusEnum.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe enviar al menos un campo para actualizar.',
  });

export const listGlAccountGroupsQuerySchema = paginationQuerySchema.extend({
  coaId: uuid.optional(),
  statementType: statementTypeEnum.optional(),
  classification: accountClassificationEnum.optional(),
  status: recordStatusEnum.optional(),
});

export const createEntityLinkSchema = z.object({
  entityType: entityLinkTypeEnum,
  entityId: uuid,
  relation: z.string().min(1).max(40).default('DEFAULT'),
  metadata: z.record(z.unknown()).default({}),
});

export const listGlAccountsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(120).optional(),
  accountType: glAccountTypeEnum.optional(),
  status: recordStatusEnum.optional(),
});

export const updateGlAccountSchema = z
  .object({
    name: z.string().min(1).max(160).optional(),
    parentAccountId: uuid.nullable().optional(),
    isControlAccount: z.boolean().optional(),
    requiresCostCenter: z.boolean().optional(),
    requiresProfitCenter: z.boolean().optional(),
    requiresPartner: z.boolean().optional(),
    requiresTaxCode: z.boolean().optional(),
    accountGroupId: uuid.nullable().optional(),
    status: recordStatusEnum.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe enviar al menos un campo para actualizar.',
  });

export const listBusinessPartnersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(120).optional(),
  partnerType: partnerTypeEnum.optional(),
  kybStatus: kybStatusEnum.optional(),
  status: recordStatusEnum.optional(),
});

export const updateBusinessPartnerSchema = z
  .object({
    legalName: z.string().min(1).max(200).optional(),
    tradeName: z.string().max(160).nullable().optional(),
    taxId: z.string().max(40).nullable().optional(),
    countryCode: z.string().length(2).optional(),
    kybStatus: kybStatusEnum.optional(),
    status: recordStatusEnum.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe enviar al menos un campo para actualizar.',
  });

export const createLegalEntitySchema = z.object({
  code: z.string().min(2).max(20),
  legalName: z.string().min(2).max(200),
  taxId: z.string().max(40).optional(),
  countryCode: z.string().length(2).default('BO'),
  baseCurrency: currency,
  timezone: z.string().min(1).default('America/La_Paz'),
});

export const createBranchSchema = z.object({
  legalEntityId: uuid,
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(120),
  city: z.string().max(80).optional(),
});

export const createFiscalYearSchema = z.object({
  legalEntityId: uuid,
  yearLabel: z.string().min(4).max(10),
  startDate: dateLike,
  endDate: dateLike,
});

export const createAccountingPeriodSchema = z.object({
  fiscalYearId: uuid,
  periodNo: z.coerce.number().int().min(1).max(13),
  startDate: dateLike,
  endDate: dateLike,
});

export const createLedgerSchema = z.object({
  legalEntityId: uuid,
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(120),
  accountingBasis: z.enum(['LOCAL_BO', 'MANAGEMENT', 'IFRS']),
  isDefault: z.boolean().default(false),
});

export const createChartOfAccountsSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(120),
  versionNo: z.coerce.number().int().positive().default(1),
  effectiveFrom: dateLike,
  effectiveTo: dateLike.optional(),
});

export const createGlAccountSchema = z.object({
  coaId: uuid,
  parentAccountId: uuid.optional(),
  accountNo: z.string().min(1).max(20),
  name: z.string().min(1).max(160),
  accountType: glAccountTypeEnum,
  normalBalance: z.enum(['D', 'C']),
  isControlAccount: z.boolean().default(false),
  requiresCostCenter: z.boolean().default(false),
  requiresProfitCenter: z.boolean().default(false),
  requiresPartner: z.boolean().default(false),
  requiresTaxCode: z.boolean().default(false),
  accountGroupId: uuid.optional(),
});

export const createTaxCodeSchema = z.object({
  code: z.string().min(1).max(20),
  taxType: z.enum(['IVA', 'IT', 'IUE', 'RETENTION', 'OTHER']),
  rate: z.coerce.number().min(0).max(100),
  recoverablePercent: z.coerce.number().min(0).max(100).default(0),
  effectiveFrom: dateLike,
  effectiveTo: dateLike.optional(),
});

export const partnerAccountPurposeEnum = z.enum([
  'AR_CONTROL',
  'AP_CONTROL',
  'CUSTOMER_ADVANCES',
  'SUPPLIER_ADVANCES',
  'SURCHARGES',
  'DISCOUNTS',
  'WITHHOLDINGS',
]);

export const createBusinessPartnerSchema = z.object({
  partnerNo: z.string().min(1).max(40),
  partnerType: partnerTypeEnum,
  legalName: z.string().min(1).max(200),
  tradeName: z.string().max(160).optional(),
  taxId: z.string().max(40).optional(),
  countryCode: z.string().length(2).default('BO'),
  kybStatus: kybStatusEnum.default('PENDING'),
  defaultAccounts: z
    .array(
      z.object({
        accountPurpose: partnerAccountPurposeEnum,
        glAccountId: uuid,
      }),
    )
    .optional(),
});

export const setPartnerDefaultAccountSchema = z.object({
  accountPurpose: partnerAccountPurposeEnum,
  glAccountId: uuid.nullable(),
});

export const addBusinessPartnerRoleSchema = z.object({
  businessPartnerId: uuid,
  roleCode: z.enum(['CUSTOMER', 'SUPPLIER', 'MERCHANT', 'LENDER', 'BANK', 'INTERCOMPANY']),
  legalEntityId: uuid.optional(),
  effectiveFrom: dateLike,
  effectiveTo: dateLike.optional(),
});

export const createContractHeaderSchema = z.object({
  contractNo: z.string().min(1).max(40),
  contractType: z.enum(['CUSTOMER_BILLING', 'SUPPLIER', 'LOAN', 'INTERCOMPANY', 'MERCHANT']),
  legalEntityId: uuid,
  counterpartyBpId: uuid,
  startDate: dateLike,
  endDate: dateLike.optional(),
  currencyCode: currency,
});

export const createContractTermSchema = z.object({
  contractId: uuid,
  termCode: z.string().min(1).max(40),
  termValueJson: z.record(z.unknown()),
  effectiveFrom: dateLike,
  effectiveTo: dateLike.optional(),
});

export const journalLineSchema = z.object({
  glAccountId: uuid,
  debit: money.default(0),
  credit: money.default(0),
  currencyCode: currency,
  amountLc: money.default(0),
  partnerId: uuid.optional(),
  costCenterId: uuid.optional(),
  profitCenterId: uuid.optional(),
  taxCodeId: uuid.optional(),
  referenceType: z.string().max(30).optional(),
  referenceId: uuid.optional(),
  description: z.string().max(240).optional(),
});

export const createAccountingDocumentSchema = z.object({
  legalEntityId: uuid,
  sourceSystem: z.string().min(1).max(30),
  sourceType: z.string().min(1).max(30),
  sourceId: z.string().min(1).max(80),
  documentType: z.string().min(1).max(30),
  documentNo: z.string().min(1).max(40),
  documentDate: dateLike,
  postingDate: dateLike,
  accountingPeriodId: uuid,
  ledgerId: uuid,
  currencyCode: currency,
  approvalStatus: z.string().max(20).default('NOT_REQUIRED'),
  lines: z.array(journalLineSchema).min(2),
});

export const bulkCreateAccountingDocumentsSchema = z
  .object({
    batchExternalId: z.string().trim().min(1).max(160).optional(),
    items: z.array(createAccountingDocumentSchema).min(1).max(50),
  })
  .superRefine((input, context) => {
    const documentNos = new Set<string>();
    const sourceKeys = new Set<string>();

    input.items.forEach((item, index) => {
      const documentNo = `${item.legalEntityId}:${item.documentNo}`.toUpperCase();
      if (documentNos.has(documentNo)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'documentNo'],
          message:
            'No se permiten números de documento duplicados dentro del mismo batch para la misma entidad legal.',
        });
      }
      documentNos.add(documentNo);

      const sourceKey = `${item.sourceSystem}:${item.sourceType}:${item.sourceId}`.toUpperCase();
      if (sourceKeys.has(sourceKey)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'sourceId'],
          message: 'No se permiten claves de origen duplicadas dentro del mismo batch.',
        });
      }
      sourceKeys.add(sourceKey);
    });
  });

export const reverseAccountingDocumentSchema = z.object({
  reversalDocumentNo: z.string().min(1).max(40),
  reversalDate: dateLike,
  accountingPeriodId: uuid,
  reason: z.string().min(3).max(240),
});

export const createBillingEventSchema = z.object({
  contractId: uuid,
  eventType: z.enum(['MDR', 'SAAS', 'SETUP', 'INTERCOMPANY', 'SUPPORT']),
  eventTime: dateLike,
  quantity: z.coerce.number().positive().default(1),
  baseAmount: positiveMoney,
  currencyCode: currency,
  externalRef: z.string().max(100).optional(),
  payload: z.record(z.unknown()).default({}),
});

export const issueArInvoiceSchema = z.object({
  legalEntityId: uuid,
  customerBpId: uuid,
  contractId: uuid.optional(),
  invoiceNo: z.string().min(1).max(40),
  invoiceDate: dateLike,
  dueDate: dateLike,
  currencyCode: currency,
  netAmount: positiveMoney,
  taxAmount: z.coerce.number().min(0).multipleOf(0.01).default(0),
  arAccountId: uuid,
  revenueAccountId: uuid,
  taxLiabilityAccountId: uuid.optional(),
  taxCodeId: uuid.optional(),
  billingEventId: uuid.optional(),
  description: z.string().min(1).max(240),
  accountingPeriodId: uuid,
  ledgerId: uuid,
  electronicTaxDocument: z
    .object({
      cuf: z.string().max(120).optional(),
      cufd: z.string().max(120).optional(),
      siatStatus: z.string().max(30).default('PENDING'),
      xmlHash: z.string().max(64).optional(),
      graphicRepresentationUrl: z.string().max(240).optional(),
      contingencyFlag: z.boolean().default(false),
      emittedAt: dateLike.optional(),
    })
    .optional(),
});

export const recordReceiptSchema = z.object({
  legalEntityId: uuid,
  payerBpId: uuid,
  receiptNo: z.string().min(1).max(40),
  receiptDate: dateLike,
  amount: positiveMoney,
  currencyCode: currency,
  bankAccountId: uuid.optional(),
  bankGlAccountId: uuid,
  arControlGlAccountId: uuid,
  accountingPeriodId: uuid,
  ledgerId: uuid,
  allocations: z
    .array(
      z.object({
        arInvoiceId: uuid,
        allocatedAmount: positiveMoney,
      }),
    )
    .min(1),
});

export const closePeriodSchema = z.object({
  legalEntityId: uuid,
  periodId: uuid,
  closeType: z.enum(['MONTHLY', 'ANNUAL']),
});

export const reopenPeriodSchema = z.object({
  periodId: uuid,
  reason: z.string().min(5).max(240),
});

export type CreateLegalEntityDto = z.infer<typeof createLegalEntitySchema>;
export type CreateBranchDto = z.infer<typeof createBranchSchema>;
export type CreateFiscalYearDto = z.infer<typeof createFiscalYearSchema>;
export type CreateAccountingPeriodDto = z.infer<typeof createAccountingPeriodSchema>;
export type CreateLedgerDto = z.infer<typeof createLedgerSchema>;
export type CreateChartOfAccountsDto = z.infer<typeof createChartOfAccountsSchema>;
export type CreateGlAccountDto = z.infer<typeof createGlAccountSchema>;
export type CreateTaxCodeDto = z.infer<typeof createTaxCodeSchema>;
export type CreateBusinessPartnerDto = z.infer<typeof createBusinessPartnerSchema>;
export type AddBusinessPartnerRoleDto = z.infer<typeof addBusinessPartnerRoleSchema>;
export type CreateContractHeaderDto = z.infer<typeof createContractHeaderSchema>;
export type CreateContractTermDto = z.infer<typeof createContractTermSchema>;
export type CreateAccountingDocumentDto = z.infer<typeof createAccountingDocumentSchema>;
export type BulkCreateAccountingDocumentsDto = z.infer<typeof bulkCreateAccountingDocumentsSchema>;
export type ReverseAccountingDocumentDto = z.infer<typeof reverseAccountingDocumentSchema>;
export type CreateBillingEventDto = z.infer<typeof createBillingEventSchema>;
export type IssueArInvoiceDto = z.infer<typeof issueArInvoiceSchema>;
export type RecordReceiptDto = z.infer<typeof recordReceiptSchema>;
export type ClosePeriodDto = z.infer<typeof closePeriodSchema>;
export type ReopenPeriodDto = z.infer<typeof reopenPeriodSchema>;
export type PaginationQueryDto = z.infer<typeof paginationQuerySchema>;
export type IdParamsDto = z.infer<typeof idParamsSchema>;
export type ListGlAccountsQueryDto = z.infer<typeof listGlAccountsQuerySchema>;
export type UpdateGlAccountDto = z.infer<typeof updateGlAccountSchema>;
export type ListBusinessPartnersQueryDto = z.infer<typeof listBusinessPartnersQuerySchema>;
export type UpdateBusinessPartnerDto = z.infer<typeof updateBusinessPartnerSchema>;
export type CreateGlAccountGroupDto = z.infer<typeof createGlAccountGroupSchema>;
export type UpdateGlAccountGroupDto = z.infer<typeof updateGlAccountGroupSchema>;
export type ListGlAccountGroupsQueryDto = z.infer<typeof listGlAccountGroupsQuerySchema>;
export type CreateEntityLinkDto = z.infer<typeof createEntityLinkSchema>;
export type SetPartnerDefaultAccountDto = z.infer<typeof setPartnerDefaultAccountSchema>;
