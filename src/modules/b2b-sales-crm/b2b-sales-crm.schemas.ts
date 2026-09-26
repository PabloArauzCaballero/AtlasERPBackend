import { z } from 'zod';
import { parseExactPositiveAmount } from '../../common/money/exact-amount-input.util';
import { zodEnum } from '../../common/catalog/domain';
import { paymentMethodDomain } from '../catalog/domains/accounting.domains';
import {
  branchStatusDomain,
  contractBillingCycleDomain,
  contractSettlementPolicyDomain,
  riskTierDomain,
} from '../catalog/domains/crm.domains';
import { merchantUserRoleDomain } from '../catalog/domains/platform.domains';
import { ONBOARDING_CASE_STATUSES, ONBOARDING_SCOPES } from './domain/onboarding-lifecycle';
import {
  AccountLifecycleStatus,
  AccountType,
  BillingTiming,
  ChecklistStatus,
  OpportunityStage,
  OpportunityType,
  TermType,
} from './b2b-sales-crm.enums';
import { checkAttributesAllowed, definitionSchemaFor } from '../../common/segmentation/rule-schema';
import type { SegmentDefinition } from '../../common/segmentation/rule-engine';
import { allocationsMatchPayment, purchaseSplitViolations } from './domain/merchant-billing-math';
import {
  ATTRIBUTES_BY_SUBJECT,
  CRM_SEGMENT_ATTRIBUTES,
  SEGMENT_SUBJECTS,
  SUBJECT_LABELS,
} from './domain/crm-segments';

const uuid = z.string().uuid();
/** Identificador numérico de Core (BIGINT) como texto: tenant, préstamo, cuota, comercio. */
const coreId = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]{0,18}$/);
const money = z.coerce.number().finite().min(0);
const positiveMoney = z.coerce.number().finite().positive();
const percent = z.coerce.number().finite().min(0).max(100);
const isoCurrency = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase());

/** Sin excepción: un importe ilegible ya lo rechaza su propio campo, aquí sólo se compara. */
function allocationsMatchPaymentSafely(
  amount: number,
  allocations: ReadonlyArray<{ amountApplied: number }>,
  currency: string,
): boolean {
  try {
    return allocationsMatchPayment(amount, allocations, currency);
  } catch {
    return false;
  }
}

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
  includeArchived: z.enum(['true', 'false']).optional(),
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
  riskTier: zodEnum(riskTierDomain).optional(),
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
  /* El número NO viaja: lo asigna el backend (PROP-AAAA-NNNNNN). Si alguien lo manda se descarta. */
  validUntil: dateOnly.optional(),
  totalEstimatedMonthlyRevenue: money.optional(),
  pricingExceptionReason: z.string().trim().min(5).max(1000).optional(),
  lines: z.array(proposalLineSchema).min(1),
});

/*
 * Edicion de la cabecera de una propuesta.
 *
 * Las lineas NO se tocan aqui: cambiar un termino comercial despues de enviar la propuesta es
 * pactar otra cosa distinta con el mismo numero, y eso se hace creando una propuesta nueva. Lo que
 * se corrige es lo que se teclea mal —la vigencia, el ingreso estimado— mientras la
 * propuesta sigue siendo un borrador.
 */
export const updateProposalSchema = z
  .object({
    validUntil: dateOnly.nullable().optional(),
    totalEstimatedMonthlyRevenue: money.nullable().optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'Debe enviar al menos un campo a modificar.',
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
    /* El número NO viaja: lo asigna el backend (CTR-AAAA-NNNNNN). */
    startDate: dateOnly,
    endDate: dateOnly.optional(),
    billingCycle: zodEnum(contractBillingCycleDomain).default('MONTHLY'),
    settlementPolicy: zodEnum(contractSettlementPolicyDomain).default('PER_CONTRACT'),
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

/**
 * Edicion de una sucursal. Todo opcional: se envia solo lo que cambia.
 *
 * `accountId` NO esta: una sucursal no se muda de comercio. Permitir cambiarlo seria mover
 * ubicaciones —con sus ventas y sus usuarios— de una cuenta a otra con un PATCH.
 */
export const updateBranchSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    city: z.string().trim().min(2).max(120).optional(),
    address: z.string().trim().max(500).optional(),
    canOriginateBnpl: z.boolean().optional(),
  })
  .refine((valor) => Object.keys(valor).length > 0, {
    message: 'Indique al menos un campo a modificar.',
  });
export type UpdateBranchDto = z.infer<typeof updateBranchSchema>;

/**
 * Alta y baja de una sucursal. No se BORRA: se desactiva.
 *
 * Una sucursal borrada se lleva por delante el historial de las ventas que origino. Lo que se
 * necesita es que deje de operar, no que deje de haber existido.
 */
export const setBranchStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']),
  reason: z.string().trim().min(3).max(300).optional(),
});
export type SetBranchStatusDto = z.infer<typeof setBranchStatusSchema>;

export const branchIdParamsSchema = z.object({ branchId: uuid });
export type BranchIdParamsDto = z.infer<typeof branchIdParamsSchema>;

/**
 * Una regla de comision (MDR), y las tres dimensiones por las que se segmenta.
 *
 * Las tres son OPCIONALES a proposito, y esa es toda la flexibilidad del modelo: una regla sin
 * ninguna es la tarifa base del contrato; con `productCategory` cobra distinto la electronica que
 * la farmacia; con `branchId` distingue una sucursal cara de una barata; con `riskSegment` cobra
 * mas por el credito que mas riesgo trae. Se combinan libremente, y gana la mas especifica.
 *
 * `minFeeAmount` y `maxFeeAmount` son el piso y el techo. El piso existe porque una venta de Bs 20
 * al 3 % deja Bs 0,60, que no paga ni el costo de procesarla; el techo, porque una venta de
 * Bs 50.000 al 3 % son Bs 1.500 de comision y ningun comercio acepta eso sin un limite.
 */
export const createMdrRuleSchema = z.object({
  contractVersionId: uuid,
  ratePercent: z.number().min(0).max(100),
  productCategory: z.string().trim().min(1).max(120).optional(),
  branchId: uuid.optional(),
  riskSegment: z.string().trim().min(1).max(60).optional(),
  minFeeAmount: z.number().min(0).optional(),
  maxFeeAmount: z.number().min(0).optional(),
  /* Con una tarifa por debajo del mínimo global, la regla sólo nace con este motivo y queda a la
     espera de aprobación (`MDR_BELOW_MINIMUM`), igual que una propuesta. */
  pricingExceptionReason: z.string().trim().min(5).max(1000).optional(),
});
export type CreateMdrRuleDto = z.infer<typeof createMdrRuleSchema>;

export const updateMdrRuleSchema = z
  .object({
    ratePercent: z.number().min(0).max(100).optional(),
    minFeeAmount: z.number().min(0).nullable().optional(),
    maxFeeAmount: z.number().min(0).nullable().optional(),
    isActive: z.boolean().optional(),
    /* Ver `createMdrRuleSchema`: bajar la tarifa por debajo del mínimo, o activar una que ya lo está,
       exige este motivo y abre la aprobación. No es un campo a modificar por sí solo. */
    pricingExceptionReason: z.string().trim().min(5).max(1000).optional(),
  })
  .refine(
    (valor) => Object.keys(valor).filter((campo) => campo !== 'pricingExceptionReason').length > 0,
    { message: 'Indique al menos un campo a modificar.' },
  );
export type UpdateMdrRuleDto = z.infer<typeof updateMdrRuleSchema>;

export const mdrRuleIdParamsSchema = z.object({ ruleId: uuid });
export type MdrRuleIdParamsDto = z.infer<typeof mdrRuleIdParamsSchema>;

export const mdrRulesQuerySchema = z.object({
  contractVersionId: uuid.optional(),
});
export type MdrRulesQueryDto = z.infer<typeof mdrRulesQuerySchema>;

export const createMerchantUserSchema = z.object({
  accountId: uuid,
  branchId: uuid.optional(),
  email: z.string().email().max(180),
  fullName: z.string().trim().min(2).max(180),
  roleCode: zodEnum(merchantUserRoleDomain),
});

export const completeChecklistItemSchema = z.object({
  checklistItemId: uuid,
  status: z.nativeEnum(ChecklistStatus).default(ChecklistStatus.COMPLETED),
});

export const checklistItemIdParamsSchema = z.object({
  onboardingCaseId: uuid,
  checklistItemId: uuid,
});

/** Lo que el navegador pide para subir el archivo de un requisito: tipo y tamaño, que AtlasBackend firma. */
export const checklistEvidenceUploadUrlSchema = z.object({
  contentType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(15 * 1024 * 1024),
});

/** El archivo ya subido: AtlasBackend lo verifica (prefijo, existencia, hash, tipo real) antes de registrarlo. */
export const attachChecklistEvidenceSchema = z.object({
  storageKey: z.string().trim().min(1).max(500),
  sha256: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{64}$/),
  contentType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(15 * 1024 * 1024),
});

export const registerPurchaseSchema = z
  .object({
    /*
     * Opcional: un comercio no manda su propia cuenta, la deriva su membresia. Se mantiene para el
     * operador interno, que si elige sobre que comercio actua (y queda auditado como tal).
     */
    merchantAccountId: uuid.optional(),
    branchId: uuid,
    /*
     * El comercio no conoce el uuid interno de su cliente: conoce su DOCUMENTO. Se acepta uno u
     * otro y el servicio resuelve. Exigir el uuid obligaba a teclear un identificador que en el
     * mostrador nadie tiene delante, y era la razon por la que esta pantalla no se podia usar.
     */
    consumerId: uuid.optional(),
    consumerExternalRef: z.string().trim().max(120).optional(),
    purchaseAmount: positiveMoney,
    downPaymentAmount: money,
    downPaymentPaidAt: z.coerce.date().optional(),
    downPaymentEvidenceRef: z.string().trim().max(240).optional(),
    financedAmount: money,
    /*
     * T-11 (2026-09-26): el servicio YA NO usa este valor — lo resuelve él mismo desde
     * `atlas_sales.customer_risk_tiers` (Core, `credit.decision.recorded`). Se conserva en el
     * contrato para no romper a un cliente que todavía lo manda; se acepta y se ignora.
     */
    riskTierAtOrigination: zodEnum(riskTierDomain).optional(),
    cohortId: z.string().trim().max(80).optional(),
    productCategory: z.string().trim().max(120).optional(),
    mdrReceivableDueDate: dateOnly,
    /*
     * Identidad común con Core (P-14, contracts/atlas-integration-v1 compra-cuota): el préstamo de
     * Core que financia esta compra. Opcional para no romper el alta manual; si viene, CADA cuota
     * trae su `coreInstallmentId` y el ERP guarda el mapeo explícito en `core_installment_links`.
     * Sin él, los avisos de pago de Core de esa cuota quedan como excepción de integración.
     */
    coreLoanRef: z
      .object({ tenantId: coreId, loanId: coreId, partnerProfileId: coreId.optional() })
      .strict()
      .optional(),
    installments: z
      .array(
        z.object({
          installmentNumber: z.coerce.number().int().positive(),
          dueDate: dateOnly,
          amount: positiveMoney,
          coreInstallmentId: coreId.optional(),
        }),
      )
      .min(1),
  })
  .superRefine((input, context) => {
    const linked = input.installments.filter((installment) => installment.coreInstallmentId);
    if (input.coreLoanRef && linked.length !== input.installments.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['installments'],
        message: 'Con coreLoanRef, cada cuota debe traer su coreInstallmentId.',
      });
    }
    if (!input.coreLoanRef && linked.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['coreLoanRef'],
        message: 'coreInstallmentId exige coreLoanRef (tenant y préstamo de Core).',
      });
    }
    if (
      new Set(linked.map((installment) => installment.coreInstallmentId)).size !== linked.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['installments'],
        message: 'Dos cuotas no pueden apuntar a la misma cuota de Core.',
      });
    }

    /*
     * La misma regla que aplica el servicio (`domain/merchant-billing-math`), en céntimos exactos:
     * financiado = compra − inicial y suma de cuotas = financiado, sin tolerancia (P-07).
     */
    for (const violation of purchaseSplitViolations(input)) {
      if (violation.code === 'DUPLICATED_INSTALLMENT_NUMBER') continue;
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [violation.path],
        message: violation.message,
      });
    }

    const installmentNumbers = new Set<number>();
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
    /*
     * El número de factura no viaja aquí: lo asigna el backend con su propio correlativo. Escribirlo
     * a mano repetía series y chocaba contra el índice único con un error de base de datos que en
     * pantalla se leía como «no se pudo emitir», sin decir por qué.
     */
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
    paymentMethod: zodEnum(paymentMethodDomain).optional(),
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
    if (!allocationsMatchPaymentSafely(input.amount, input.allocations, input.currency)) {
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

/**
 * Importe de dinero EXACTO (cadena preferida): positivo, sin notación científica y con 2 decimales
 * como mucho. Sale como cadena canónica (`"300.00"`); nunca pasa por `number`.
 */
const exactMoney = z.union([z.string(), z.number()]).transform((value, context) => {
  const parsed = parseExactPositiveAmount(value);
  if (parsed === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Importe inválido: positivo, con 2 decimales como máximo (p. ej. "300.00").',
    });
    return z.NEVER;
  }
  return parsed;
});

const externalReference = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/, 'Referencia con caracteres no permitidos.');

/**
 * Registro de la liquidación de una CxP al comercio (P-05).
 *
 * CAMBIO DE CONTRATO deliberado (corrección de seguridad, 2026-09-24): antes bastaba `paidAt`, y
 * una fecha daba por pagado al comercio y hacía nacer la CxC contra el consumidor. Ahora el cuerpo
 * exige la referencia única del pago, el importe, la moneda, el comercio beneficiario, la fecha y
 * el archivo de evidencia; el cliente que siga mandando sólo `paidAt` recibe 400 VALIDATION_ERROR.
 * El registro queda PENDIENTE: la confirma otra persona con `/settlement/approve`.
 */
export const markPayablePaidSchema = z
  .object({
    settlementReference: externalReference,
    amount: exactMoney,
    currency: isoCurrency,
    beneficiaryAccountId: uuid,
    paidAt: z.coerce.date(),
    evidenceFileId: uuid,
  })
  .strict();

export const decidePayableSettlementSchema = z
  .object({ note: z.string().trim().min(3).max(240).optional() })
  .strict();

export const rejectPayableSettlementSchema = z
  .object({ note: z.string().trim().min(3).max(240) })
  .strict();

export const cancelPayableSchema = z.object({ reason: z.string().trim().min(3).max(240) }).strict();

/**
 * Cobro de recuperación contra el consumidor. `paymentReference` identifica el cobro: repetirlo
 * devuelve el mismo resultado sin volver a sumar. Antes bastaba `amount` y cada repetición sumaba.
 */
export const applyRecoveryPaymentSchema = z
  .object({
    amount: exactMoney,
    paymentReference: externalReference,
    currency: isoCurrency.default('BOB'),
    receivedAt: z.coerce.date().optional(),
  })
  .strict();

export const reverseRecoveryMovementSchema = z
  .object({
    reversalReference: externalReference,
    reason: z.string().trim().min(3).max(240),
  })
  .strict();

export const recoveryMovementParamsSchema = z.object({ recoveryId: uuid, movementId: uuid });

/**
 * Resolución de un elemento de la cola de revisión de cobertura (P-04).
 *
 * - `CONFIRM_NOTICE`: el aviso de pago REPORTED se verificó; queda CONFIRMED y descuenta del saldo.
 * - `REJECT_NOTICE`: el aviso no se sostiene; queda REJECTED y la cuota vuelve a ser cubrible.
 * - `DISMISS`: descartar sin tocar pagos (contrato no activo, o aviso ya decidido por otra vía).
 *
 * `note` es obligatoria en los tres casos: es el motivo que queda en la historia del elemento.
 * `noticeId` sólo hace falta si la cuota tiene más de un aviso pendiente.
 */
export const coverageReviewActionSchema = z.enum(['CONFIRM_NOTICE', 'REJECT_NOTICE', 'DISMISS']);

export const resolveCoverageReviewItemSchema = z
  .object({
    action: coverageReviewActionSchema,
    noticeId: uuid.optional(),
    note: z.string().trim().min(3).max(240),
  })
  .strict();

export const reviewItemIdParamsSchema = z.object({ reviewItemId: uuid });

export const reviewQueueQuerySchema = z
  .object({ status: z.enum(['OPEN', 'RESOLVED', 'ALL']).default('OPEN') })
  .strict();

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

/*
 * Tags de clasificación de cuentas.
 *
 * Existían sólo como efecto secundario del alta de una cuenta: se escribían como texto libre y el
 * backend hacía `findOrCreate`. Eso deja un catálogo que nadie puede ver ni corregir —un «mayorista»
 * y un «mayoristas» conviven para siempre y parten en dos el filtro—. Estos esquemas son los que
 * permiten administrarlo de verdad.
 */
export const createAccountTagSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    // Se normaliza a minúsculas igual que en el alta de cuentas, para no duplicar por mayúsculas.
    .transform((value) => value.toLowerCase()),
  description: z.string().trim().max(200).optional(),
  isActive: z.coerce.boolean().optional(),
});

export const updateAccountTagSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .transform((value) => value.toLowerCase())
      .optional(),
    description: z.string().trim().max(200).nullable().optional(),
    isActive: z.coerce.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Indique al menos un campo a modificar.',
  });

/**
 * Segmentos comerciales: a quién agrupa cada uno y con qué reglas.
 *
 * El sujeto es obligatorio y no se puede cambiar después: es lo que decide qué atributos admite la
 * definición, y el mismo JSON contaría dos poblaciones distintas según a quién se le aplique.
 */
const crmSegmentDefinitionSchema = definitionSchemaFor(CRM_SEGMENT_ATTRIBUTES);

/**
 * Listado de sucursales de un comercio.
 *
 * Faltaba: se podían crear, corregir y dar de baja, y no LEER. Una sucursal creada desde el ERP no
 * volvía a aparecer en ninguna respuesta —era escritura sin lectura—, y sin listado tampoco se
 * podía elegir la sucursal donde se origina una compra a plazos.
 */
/*
 * La cola de onboarding. `scope` decide qué es «trabajo»: por defecto los casos abiertos; el
 * historial (activados) y «todos» son filtros explícitos. El filtro va AQUÍ y no en la tabla:
 * filtrar en el cliente sobre una página truncada miente en cuanto haya más casos que el límite.
 */
export const listOnboardingCasesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
  scope: z.enum(ONBOARDING_SCOPES).default('abiertos'),
  status: z.enum(ONBOARDING_CASE_STATUSES).optional(),
  accountId: uuid.optional(),
  search: z.string().trim().min(1).max(120).optional(),
});

/* El contrato del caso: se ELIGE entre las versiones de los contratos de esa misma cuenta. */
export const assignCaseContractSchema = z.object({ contractVersionId: uuid });

/*
 * La comisión del alta. Sin `contractVersionId`: cuelga de la versión que el caso ya tiene, así
 * que pedirla otra vez sólo daría ocasión de colgar la regla de otro contrato.
 */
export const createCaseMdrRuleSchema = createMdrRuleSchema.omit({ contractVersionId: true });

/* Por qué se pide la verificación. Opcional: queda en el expediente de AtlasBackend. */
export const requestKybReviewSchema = z.object({
  reason: z.string().trim().min(3).max(240).optional(),
});

export const listBranchesQuerySchema = z.object({
  accountId: uuid.optional(),
  /* Cadena libre = filtro por un estado inexistente = lista vacía sin decir por qué. */
  status: zodEnum(branchStatusDomain).optional(),
});

export const createCrmSegmentSchema = z
  .object({
    subject: z.enum(SEGMENT_SUBJECTS),
    name: z.string().trim().min(3).max(140),
    description: z.string().trim().max(500).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    ownerUserId: uuid.optional(),
    definition: crmSegmentDefinitionSchema,
  })
  .superRefine((input, context) => {
    checkAttributesAllowed(
      input.definition as SegmentDefinition,
      ATTRIBUTES_BY_SUBJECT[input.subject],
      context,
      { label: SUBJECT_LABELS[input.subject], path: ['definition'] },
    );
  });

export const updateCrmSegmentSchema = z
  .object({
    name: z.string().trim().min(3).max(140).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    ownerUserId: uuid.nullable().optional(),
    definition: crmSegmentDefinitionSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Indique al menos un campo a modificar.',
  });

export const listCrmSegmentsQuerySchema = z.object({
  subject: z.enum(SEGMENT_SUBJECTS).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
