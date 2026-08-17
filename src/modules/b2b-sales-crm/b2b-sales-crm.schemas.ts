import { z } from 'zod';
import {
  AccountLifecycleStatus,
  AccountType,
  BillingTiming,
  ChecklistStatus,
  OpportunityStage,
  OpportunityType,
  TermType,
} from './b2b-sales-crm.enums';

const uuid = z.string().uuid();
const money = z.coerce.number().finite().min(0);
const positiveMoney = z.coerce.number().finite().positive();
const percent = z.coerce.number().finite().min(0).max(100);
const isoCurrency = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase());

function isRealDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  return (
    parsedDate.getUTCFullYear() === year &&
    parsedDate.getUTCMonth() === month - 1 &&
    parsedDate.getUTCDate() === day
  );
}

const dateOnly = z.string().refine(isRealDateOnly, {
  message: 'Debe ser una fecha real con formato YYYY-MM-DD.',
});

export const idParamsSchema = z.object({ id: uuid });
export const accountIdParamsSchema = z.object({ accountId: uuid });
export const opportunityIdParamsSchema = z.object({ opportunityId: uuid });
export const proposalIdParamsSchema = z.object({ proposalId: uuid });
export const contractIdParamsSchema = z.object({ contractId: uuid });
export const onboardingCaseIdParamsSchema = z.object({ onboardingCaseId: uuid });
export const payableIdParamsSchema = z.object({ payableId: uuid });
export const recoveryIdParamsSchema = z.object({ recoveryId: uuid });

export const listAccountsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
  status: z.nativeEnum(AccountLifecycleStatus).optional(),
  search: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().min(1).max(120).optional(),
  businessLine: z.string().trim().min(1).max(160).optional(),
  tag: z.string().trim().min(1).max(80).optional(),
  sortBy: z.enum(['createdAt', 'tradeName', 'legalName', 'lifecycleStatus']).default('createdAt'),
  sortOrder: z.enum(['ASC', 'DESC']).default('DESC'),
});

export const createAccountSchema = z.object({
  legalName: z.string().trim().min(2).max(220),
  tradeName: z.string().trim().min(2).max(220),
  taxId: z.string().trim().min(3).max(60).optional(),
  accountType: z.nativeEnum(AccountType).default(AccountType.MERCHANT),
  industry: z.string().trim().min(2).max(120).optional(),
  category: z.string().trim().min(2).max(120),
  businessLine: z.string().trim().min(2).max(160),
  businessDescription: z.string().trim().min(10).max(2000).optional(),
  websiteUrl: z.string().url().max(500).optional(),
  countryCode: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase())
    .default('BO'),
  city: z.string().trim().min(2).max(120).optional(),
  address: z.string().trim().min(3).max(500).optional(),
  employeeCount: z.coerce.number().int().min(0).max(10000000).optional(),
  foundedYear: z.coerce.number().int().min(1800).max(new Date().getUTCFullYear()).optional(),
  annualRevenue: money.optional(),
  tags: z
    .array(z.string().trim().min(1).max(80))
    .max(30)
    .default([])
    .transform((tags) => [...new Set(tags.map((tag) => tag.toLowerCase()))]),
  ownerUserId: uuid.optional(),
  territoryId: uuid.optional(),
  riskTier: z.string().trim().min(2).max(30).optional(),
  expectedMonthlyVolume: money.optional(),
  notes: z.string().trim().max(2000).optional(),
  primaryContact: z.object({
    fullName: z.string().trim().min(2).max(180),
    roleTitle: z.string().trim().max(120).optional(),
    email: z.string().email().max(180).optional(),
    phone: z.string().trim().max(60).optional(),
    decisionRole: z.string().trim().max(60).optional(),
  }),
});

export const bulkCreateAccountsSchema = z
  .object({
    batchExternalId: z.string().trim().min(1).max(160).optional(),
    items: z.array(createAccountSchema).min(1).max(100),
  })
  .superRefine((input, context) => {
    const taxIds = new Set<string>();
    const tradeNames = new Set<string>();

    input.items.forEach((item, index) => {
      if (item.taxId) {
        const normalizedTaxId = item.taxId.trim().toUpperCase();
        if (taxIds.has(normalizedTaxId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', index, 'taxId'],
            message: 'No se permiten taxId/NIT duplicados dentro del mismo batch.',
          });
        }
        taxIds.add(normalizedTaxId);
      }

      const normalizedTradeName = item.tradeName.trim().toUpperCase();
      if (tradeNames.has(normalizedTradeName)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'tradeName'],
          message: 'No se permiten nombres comerciales duplicados dentro del mismo batch.',
        });
      }
      tradeNames.add(normalizedTradeName);
    });
  });

export const qualifyAccountSchema = z
  .object({
    hasCommercialFit: z.boolean(),
    disqualificationReason: z.string().trim().min(3).max(500).optional(),
    createOpportunity: z.boolean().default(false),
    opportunity: z
      .object({
        name: z.string().trim().min(3).max(220),
        opportunityType: z.nativeEnum(OpportunityType),
        expectedMonthlyVolume: money.optional(),
        expectedMdrRate: percent.optional(),
        probability: percent.default(0),
        expectedCloseDate: dateOnly.optional(),
      })
      .optional(),
  })
  .superRefine((input, context) => {
    if (!input.hasCommercialFit && !input.disqualificationReason) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['disqualificationReason'],
        message: 'Debe registrar motivo cuando la cuenta no tiene fit comercial.',
      });
    }

    if (input.hasCommercialFit && input.createOpportunity && !input.opportunity) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['opportunity'],
        message: 'Debe enviar datos de oportunidad cuando createOpportunity=true.',
      });
    }
  });

export const createContactSchema = z.object({
  fullName: z.string().trim().min(2).max(180),
  roleTitle: z.string().trim().max(120).optional(),
  email: z.string().email().max(180).optional(),
  phone: z.string().trim().max(60).optional(),
  decisionRole: z.string().trim().max(60).optional(),
  isPrimary: z.boolean().default(false),
});

export const listOpportunitiesQuerySchema = z.object({
  accountId: uuid.optional(),
  stage: z.nativeEnum(OpportunityStage).optional(),
});

export const createOpportunitySchema = z.object({
  accountId: uuid,
  ownerUserId: uuid,
  name: z.string().trim().min(3).max(220),
  opportunityType: z.nativeEnum(OpportunityType),
  expectedMonthlyVolume: money.optional(),
  expectedMdrRate: percent.optional(),
  probability: percent.default(0),
  expectedCloseDate: dateOnly.optional(),
});

export const moveOpportunityStageSchema = z
  .object({
    stage: z.nativeEnum(OpportunityStage),
    lossReason: z.string().trim().min(3).max(220).optional(),
  })
  .refine((input) => input.stage !== OpportunityStage.CLOSED_LOST || Boolean(input.lossReason), {
    path: ['lossReason'],
    message: 'Debe registrar motivo de pérdida para CLOSED_LOST.',
  });

const proposalLineSchema = z
  .object({
    termType: z.nativeEnum(TermType),
    description: z.string().trim().min(3).max(240),
    ratePercent: percent.optional(),
    fixedAmount: money.optional(),
    currency: isoCurrency.default('BOB'),
    billingTiming: z.nativeEnum(BillingTiming),
    minimumMonthlyAmount: money.optional(),
  })
  .refine((line) => line.ratePercent !== undefined || line.fixedAmount !== undefined, {
    message: 'Cada línea debe tener ratePercent o fixedAmount.',
    path: ['ratePercent'],
  });

export const createProposalSchema = z.object({
  opportunityId: uuid,
  proposalNumber: z.string().trim().min(3).max(80),
  validUntil: dateOnly.optional(),
  totalEstimatedMonthlyRevenue: money.optional(),
  pricingExceptionReason: z.string().trim().min(5).max(1000).optional(),
  lines: z.array(proposalLineSchema).min(1),
});

export const decideApprovalSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().trim().min(3).max(1000),
});

export const rejectProposalSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const createContractFromProposalSchema = z
  .object({
    proposalId: uuid,
    contractNumber: z.string().trim().min(3).max(80),
    startDate: dateOnly,
    endDate: dateOnly.optional(),
    billingCycle: z.string().trim().min(3).max(40).default('MONTHLY'),
    settlementPolicy: z.string().trim().min(3).max(80).default('PER_CONTRACT'),
    documentUrl: z.string().url().optional(),
  })
  .refine((input) => !input.endDate || input.endDate >= input.startDate, {
    path: ['endDate'],
    message: 'endDate debe ser mayor o igual a startDate.',
  });

export const signContractSchema = z.object({
  signedAt: z.coerce.date().optional(),
  approvedByUserId: uuid,
});

export const createOnboardingCaseSchema = z.object({
  accountId: uuid,
  ownerUserId: uuid,
  checklistItems: z
    .array(
      z.object({
        itemType: z.string().trim().min(2).max(80),
        description: z.string().trim().min(3).max(240),
      }),
    )
    .min(1),
});

export const createBranchSchema = z.object({
  accountId: uuid,
  name: z.string().trim().min(2).max(160),
  city: z.string().trim().min(2).max(120),
  address: z.string().trim().max(500).optional(),
});

export const createMerchantUserSchema = z.object({
  accountId: uuid,
  branchId: uuid.optional(),
  email: z.string().email().max(180),
  fullName: z.string().trim().min(2).max(180),
  roleCode: z.string().trim().min(2).max(80),
});

export const completeChecklistItemSchema = z.object({
  checklistItemId: uuid,
  status: z.nativeEnum(ChecklistStatus).default(ChecklistStatus.COMPLETED),
});

export const registerPurchaseSchema = z
  .object({
    merchantAccountId: uuid,
    branchId: uuid,
    consumerId: uuid,
    consumerExternalRef: z.string().trim().max(120).optional(),
    purchaseAmount: positiveMoney,
    downPaymentAmount: money,
    downPaymentPaidAt: z.coerce.date().optional(),
    downPaymentEvidenceRef: z.string().trim().max(240).optional(),
    financedAmount: money,
    riskTierAtOrigination: z.string().trim().max(60).optional(),
    cohortId: z.string().trim().max(80).optional(),
    productCategory: z.string().trim().max(120).optional(),
    mdrReceivableDueDate: dateOnly,
    installments: z
      .array(
        z.object({
          installmentNumber: z.coerce.number().int().positive(),
          dueDate: dateOnly,
          amount: positiveMoney,
        }),
      )
      .min(1),
  })
  .superRefine((input, context) => {
    const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
    const expectedDownPayment = roundMoney(input.purchaseAmount * 0.6);
    const expectedFinancedAmount = roundMoney(input.purchaseAmount - expectedDownPayment);
    const installmentsTotal = roundMoney(
      input.installments.reduce((sum, installment) => sum + installment.amount, 0),
    );
    const installmentNumbers = new Set<number>();

    if (Math.abs(input.downPaymentAmount - expectedDownPayment) > 0.01) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['downPaymentAmount'],
        message: 'El pago inicial debe representar 60% de la compra.',
      });
    }

    if (Math.abs(input.financedAmount - expectedFinancedAmount) > 0.01) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['financedAmount'],
        message: 'El monto financiado debe representar el 40% restante.',
      });
    }

    if (Math.abs(installmentsTotal - input.financedAmount) > 0.01) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['installments'],
        message: 'La suma de cuotas debe coincidir con el monto financiado.',
      });
    }

    input.installments.forEach((installment, index) => {
      if (installmentNumbers.has(installment.installmentNumber)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['installments', index, 'installmentNumber'],
          message: 'No se permiten números de cuota duplicados.',
        });
      }
      installmentNumbers.add(installment.installmentNumber);
    });
  });

export const issueInvoiceSchema = z
  .object({
    accountId: uuid,
    contractId: uuid.optional(),
    invoiceNumber: z.string().trim().min(3).max(80),
    invoiceDate: dateOnly,
    dueDate: dateOnly,
    receivableIds: z.array(uuid).min(1),
    externalTaxRef: z.string().trim().max(180).optional(),
  })
  .superRefine((input, context) => {
    if (input.dueDate < input.invoiceDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dueDate'],
        message: 'dueDate debe ser mayor o igual a invoiceDate.',
      });
    }

    if (new Set(input.receivableIds).size !== input.receivableIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['receivableIds'],
        message: 'No se permiten CxC duplicadas en una misma factura.',
      });
    }
  });

export const registerMerchantPaymentSchema = z
  .object({
    accountId: uuid,
    amount: positiveMoney,
    currency: isoCurrency.default('BOB'),
    paidAt: z.coerce.date(),
    paymentMethod: z.string().trim().max(80).optional(),
    externalRef: z.string().trim().max(180).optional(),
    allocations: z
      .array(
        z.object({
          receivableId: uuid,
          amountApplied: positiveMoney,
        }),
      )
      .min(1),
  })
  .superRefine((input, context) => {
    const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
    const allocationTotal = roundMoney(
      input.allocations.reduce((sum, allocation) => sum + allocation.amountApplied, 0),
    );

    if (Math.abs(allocationTotal - input.amount) > 0.01) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['allocations'],
        message: 'La suma de asignaciones debe coincidir con el monto total del pago.',
      });
    }

    const receivableIds = input.allocations.map((allocation) => allocation.receivableId);
    if (new Set(receivableIds).size !== receivableIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['allocations'],
        message: 'No se permiten asignaciones duplicadas a la misma CxC.',
      });
    }
  });

export const scheduleCoverageSchema = z.object({
  installmentId: uuid,
  scheduledPaymentDate: dateOnly,
  reason: z.string().trim().max(80).default('CUSTOMER_INSTALLMENT_DEFAULT_COVERAGE'),
});

export const markPayablePaidSchema = z.object({
  paidAt: z.coerce.date(),
});

export const applyRecoveryPaymentSchema = z.object({
  amount: positiveMoney,
});

export const runReconciliationSchema = z
  .object({
    periodStart: dateOnly,
    periodEnd: dateOnly,
  })
  .refine((input) => input.periodEnd >= input.periodStart, {
    path: ['periodEnd'],
    message: 'periodEnd debe ser mayor o igual a periodStart.',
  });

// ==================================================
// Actividades comerciales (notas, llamadas, reuniones, tareas/recordatorios)
// ==================================================
export const activityTypeEnum = z.enum([
  'NOTE',
  'CALL',
  'MEETING',
  'EMAIL',
  'WHATSAPP',
  'VISIT',
  'TASK',
  'OTHER',
]);

export const createActivitySchema = z.object({
  accountId: uuid,
  opportunityId: uuid.optional(),
  ownerUserId: uuid,
  activityType: activityTypeEnum,
  subject: z.string().trim().min(1).max(220),
  description: z.string().trim().max(4000).optional(),
  dueAt: z.coerce.date().optional(),
});

export const updateActivitySchema = z
  .object({
    activityType: activityTypeEnum.optional(),
    subject: z.string().trim().min(1).max(220).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    dueAt: z.coerce.date().nullable().optional(),
    completedAt: z.coerce.date().nullable().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'Debe enviar al menos un campo para actualizar.',
  });

export const listActivitiesQuerySchema = z
  .object({
    accountId: uuid.optional(),
    opportunityId: uuid.optional(),
    activityType: activityTypeEnum.optional(),
    pending: z.enum(['true', 'false']).optional(),
  })
  .refine((input) => Boolean(input.accountId || input.opportunityId), {
    message: 'Debe indicar accountId u opportunityId.',
  });

// Puente facturación merchant → contabilidad: postea la factura al mayor.
export const postMerchantInvoiceToGlSchema = z.object({
  legalEntityId: uuid,
  accountingPeriodId: uuid,
  ledgerId: uuid,
  arAccountId: uuid,
  revenueAccountId: uuid,
  taxAccountId: uuid.optional(),
  partnerId: uuid.optional(),
  currencyCode: z.string().trim().length(3).default('BOB'),
});

/**
 * Cuántas filas de historial de calificación devolver.
 *
 * Tiene tope porque el historial de una cuenta muy recalificada crece sin límite, y una consulta sin
 * cota lo arrastra entero a memoria: el mismo endpoint que hoy responde en milisegundos es, dos años
 * de barridos después, el que tumba la instancia.
 */
export const ratingHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** Barrido de calificación: acotado para que una llamada no bloquee la cartera entera. */
export const ratingSweepSchema = z.object({
  limit: z.number().int().min(1).max(5000).default(500),
});
