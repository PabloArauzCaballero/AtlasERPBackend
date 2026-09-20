import { z } from 'zod';
import { zodEnum } from '../../../../common/catalog/domain';
import {
  accountSubClassificationDomain,
  accountingContractStatusDomain,
  accountingContractTypeDomain,
  arInvoiceStatusDomain,
  businessPartnerStatusDomain,
  documentApprovalStatusDomain,
  entityLinkRelationDomain,
  partnerTypeDomain,
  receiptStatusDomain,
  siatStatusDomain,
} from '../../../catalog/domains/accounting.domains';

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
export const partnerTypeEnum = zodEnum(partnerTypeDomain);
export const kybStatusEnum = z.enum(['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED']);
/*
 * Un business partner puede estar BLOQUEADO (lo admitía la base y no el esquema) y ARCHIVADO (lo
 * admitía el esquema y no la base: devolvía un 500). El dominio es la unión.
 */
export const businessPartnerStatusEnum = zodEnum(businessPartnerStatusDomain);

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
  subClassification: zodEnum(accountSubClassificationDomain).optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const updateGlAccountGroupSchema = z
  .object({
    parentGroupId: uuid.nullable().optional(),
    name: z.string().min(1).max(160).optional(),
    statementType: statementTypeEnum.optional(),
    classification: accountClassificationEnum.optional(),
    subClassification: zodEnum(accountSubClassificationDomain).nullable().optional(),
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
  relation: zodEnum(entityLinkRelationDomain).default('DEFAULT'),
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
  status: businessPartnerStatusEnum.optional(),
});

export const updateBusinessPartnerSchema = z
  .object({
    legalName: z.string().min(1).max(200).optional(),
    tradeName: z.string().max(160).nullable().optional(),
    taxId: z.string().max(40).nullable().optional(),
    countryCode: z.string().length(2).optional(),
    kybStatus: kybStatusEnum.optional(),
    status: businessPartnerStatusEnum.optional(),
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
  /* Si no viene, se deriva de las fechas: «2026» o «2026-2027». */
  yearLabel: z.string().trim().min(4).max(10).optional(),
  startDate: dateLike,
  endDate: dateLike,
});

export const createAccountingPeriodSchema = z.object({
  fiscalYearId: uuid,
  /* Si no viene, es el siguiente del año fiscal. */
  periodNo: z.coerce.number().int().min(1).max(13).optional(),
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
  /* El número NO viaja: lo asigna el backend (BP-AAAA-NNNNNN). Si alguien lo manda se descarta, como en las facturas. */
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
  /* El número NO viaja: lo asigna el backend (CTA-AAAA-NNNNNN). */
  contractType: zodEnum(accountingContractTypeDomain),
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
  /*
   * Sistema, tipo e id de origen son la CLAVE DE INTEGRACIÓN (y la de idempotencia de los lotes):
   * quien importa los elige. No se cierran aquí; `GET /catalog/domains` publica los habituales para
   * que el alta manual los ofrezca en un select.
   *
   * En un asiento tecleado a mano no hay «sistema de origen»: es este. Por eso desde el 2026-09-19
   * traen valor por defecto y el id se genera del número del documento —la pantalla pedía los tres
   * y proponía `MANUAL-<marca de tiempo>`, que es exactamente lo que el backend puede poner solo—.
   */
  sourceSystem: z.string().min(1).max(30).default('ATLAS_ERP'),
  sourceType: z.string().min(1).max(30).default('MANUAL'),
  sourceId: z.string().min(1).max(80).optional(),
  documentType: z.string().min(1).max(30),
  /* Si no viene, lo asigna el backend por entidad legal: DOC-AAAA-NNNNNN. */
  documentNo: z.string().trim().min(1).max(40).optional(),
  documentDate: dateLike,
  /* Sin fecha de contabilización se usa la del documento: en un asiento manual son la misma. */
  postingDate: dateLike.optional(),
  /*
   * El período lo dice la fecha de contabilización y el libro la entidad legal: opcionales desde
   * el 2026-09-19 y deducidos por `AccountingDefaultsService` cuando no vienen. Se siguen
   * aceptando —una importación que ya los trae no cambia— y lo explícito manda sobre lo deducido.
   */
  accountingPeriodId: uuid.optional(),
  ledgerId: uuid.optional(),
  currencyCode: currency,
  /* Era texto libre contra un CHECK de cuatro valores: un valor fuera daba 500. */
  approvalStatus: zodEnum(documentApprovalStatusDomain).default('NOT_REQUIRED'),
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
      // Sin número no hay duplicado posible: lo asigna el backend, uno distinto por documento.
      const documentNo = item.documentNo
        ? `${item.legalEntityId}:${item.documentNo}`.toUpperCase()
        : null;
      if (documentNo && documentNos.has(documentNo)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'documentNo'],
          message:
            'No se permiten números de documento duplicados dentro del mismo batch para la misma entidad legal.',
        });
      }
      if (documentNo) documentNos.add(documentNo);

      /* Sin id de origen no hay clave que repetir: la genera el backend, distinta por documento. */
      const sourceKey = item.sourceId
        ? `${item.sourceSystem}:${item.sourceType}:${item.sourceId}`.toUpperCase()
        : null;
      if (sourceKey && sourceKeys.has(sourceKey)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'sourceId'],
          message: 'No se permiten claves de origen duplicadas dentro del mismo batch.',
        });
      }
      if (sourceKey) sourceKeys.add(sourceKey);
    });
  });

export const reverseAccountingDocumentSchema = z.object({
  /* El asiento de reversión toma siempre el siguiente número de la serie DOC de su entidad legal. */
  reversalDate: dateLike,
  /*
   * El período sale de la fecha de reversión, como en cualquier otro asiento.
   *
   * Pedirlo era pedir dos veces lo mismo con la posibilidad de contradecirse: una reversión
   * fechada en septiembre contra el período de julio se aceptaba sin rechistar.
   */
  accountingPeriodId: uuid.optional(),
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
  /*
   * El número NO viaja en la petición: lo asigna el backend al emitir.
   *
   * Un correlativo fiscal que teclea quien factura se repite, se salta números o se inventa una
   * serie nueva sin que nadie lo note hasta la revisión. La pantalla ya no lo pide y aquí se
   * rechaza si alguien lo manda de todos modos, para que no queden dos verdades sobre quién
   * numera.
   */
  invoiceDate: dateLike,
  dueDate: dateLike,
  currencyCode: currency,
  netAmount: positiveMoney,
  taxAmount: z.coerce.number().min(0).multipleOf(0.01).default(0),
  /*
   * Los identificadores que el sistema ya sabe son OPCIONALES desde el 2026-09-19.
   *
   * La cuenta de control del cliente está en su ficha, el período lo dice la fecha, el libro lo
   * dice la entidad legal y la cuenta del impuesto la trae el código tributario. Pedirlos a quien
   * factura alargaba el alta a dieciocho campos y permitía elegir el equivocado sin aviso: un
   * asiento contra el período de julio de otra empresa cuadra exactamente igual que el bueno.
   * Se siguen ACEPTANDO —quien integra por API y sabe cuál quiere, manda el suyo— y lo que llega
   * explícito gana sobre lo deducido (`AccountingDefaultsService`).
   */
  arAccountId: uuid.optional(),
  /* La cuenta de ingreso NO se deduce: qué se está vendiendo es la única decisión contable real. */
  revenueAccountId: uuid,
  taxLiabilityAccountId: uuid.optional(),
  taxCodeId: uuid.optional(),
  billingEventId: uuid.optional(),
  description: z.string().min(1).max(240),
  accountingPeriodId: uuid.optional(),
  ledgerId: uuid.optional(),
  electronicTaxDocument: z
    .object({
      cuf: z.string().max(120).optional(),
      cufd: z.string().max(120).optional(),
      siatStatus: zodEnum(siatStatusDomain).default('PENDING'),
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
  /* El número NO viaja: lo asigna el backend por entidad legal (REC-AAAA-NNNNNN). */
  receiptDate: dateLike,
  amount: positiveMoney,
  currencyCode: currency,
  bankAccountId: uuid.optional(),
  /* Deducibles, como en la factura: banco de la propia cuenta bancaria, control AR de la ficha
     del pagador, período de la fecha y libro de la entidad. Ver `AccountingDefaultsService`. */
  bankGlAccountId: uuid.optional(),
  arControlGlAccountId: uuid.optional(),
  accountingPeriodId: uuid.optional(),
  ledgerId: uuid.optional(),
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

/*
 * Ediciones de recibo, contrato y factura AR.
 *
 * Los tres PATCH recibían `@Body() Record<string, unknown>` y sólo filtraban CLAVES, nunca valores:
 * un estado fuera del CHECK llegaba a Postgres y volvía como 500 «error de base de datos», y en el
 * contrato —que no tiene CHECK— se guardaba cualquier cadena. Las claves admitidas son las mismas
 * que la lista blanca de cada servicio; las fechas siguen viajando como texto AAAA-MM-DD para que la
 * fila devuelta no cambie de forma.
 */
const dateOnlyText = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}/, 'Fecha con formato AAAA-MM-DD.');

export const updateReceiptSchema = z.object({
  // Renumerar deja un hueco donde estaba y un duplicado donde va: el número no se edita.
  receiptDate: dateOnlyText.optional(),
  status: zodEnum(receiptStatusDomain).optional(),
  bankAccountId: uuid.nullable().optional(),
});
export type UpdateReceiptDto = z.infer<typeof updateReceiptSchema>;

export const updateContractHeaderSchema = z.object({
  // El número de contrato es la referencia con la que lo citan los documentos: no se edita.
  contractType: zodEnum(accountingContractTypeDomain).optional(),
  counterpartyBpId: uuid.optional(),
  startDate: dateOnlyText.optional(),
  endDate: dateOnlyText.nullable().optional(),
  currencyCode: z.string().trim().length(3).optional(),
  status: zodEnum(accountingContractStatusDomain).optional(),
});
export type UpdateContractHeaderDto = z.infer<typeof updateContractHeaderSchema>;

export const updateArInvoiceSchema = z.object({
  invoiceDate: dateOnlyText.optional(),
  dueDate: dateOnlyText.optional(),
  status: zodEnum(arInvoiceStatusDomain).optional(),
});
export type UpdateArInvoiceDto = z.infer<typeof updateArInvoiceSchema>;
