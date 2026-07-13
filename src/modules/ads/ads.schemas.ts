import { z } from 'zod';
import {
  advertiserStatuses,
  approvalStatuses,
  auditSeverities,
  billingModes,
  buyingModels,
  campaignStatuses,
  eventTypes,
  moderationDecisions,
  policyRuleTypes,
  riskStatuses,
} from './ads.enums';

const uuidSchema = z.string().uuid();
const microsSchema = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoDateTimeSchema = z.string().datetime({ offset: true });
const currencySchema = z
  .string()
  .length(3)
  .transform((value) => value.toUpperCase());
const reasonSchema = z.string().trim().min(8).max(500);

const withValidDateRange = <TSchema extends z.ZodTypeAny>(schema: TSchema): TSchema =>
  schema.refine(
    (value) => {
      const candidate = value as {
        from?: string;
        to?: string;
        periodStart?: string;
        periodEnd?: string;
      };
      const start = candidate.from ?? candidate.periodStart;
      const end = candidate.to ?? candidate.periodEnd;
      if (!start || !end) return true;
      return new Date(`${end}T00:00:00.000Z`) >= new Date(`${start}T00:00:00.000Z`);
    },
    { message: 'La fecha fin no puede ser anterior a la fecha inicio.' },
  ) as unknown as TSchema;

export const idParamSchema = z.object({ id: uuidSchema });
export const advertiserIdParamSchema = z.object({ advertiserId: uuidSchema });
export const campaignIdParamSchema = z.object({ campaignId: uuidSchema });
export const reviewIdParamSchema = z.object({ reviewId: uuidSchema });
export const invoiceIdParamSchema = z.object({ invoiceId: uuidSchema });
export const eventIdParamSchema = z.object({ eventId: uuidSchema });

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
});

export const dashboardQuerySchema = withValidDateRange(
  paginationQuerySchema.pick({}).extend({
    from: dateStringSchema.optional(),
    to: dateStringSchema.optional(),
    advertiserId: uuidSchema.optional(),
    placementId: uuidSchema.optional(),
    status: z.enum(campaignStatuses).optional(),
  }),
);

export const listAdvertisersQuerySchema = paginationQuerySchema.extend({
  status: z.enum(advertiserStatuses).optional(),
  riskStatus: z.enum(riskStatuses).optional(),
  billingMode: z.enum(billingModes).optional(),
  search: z.string().trim().min(2).max(120).optional(),
});

export const createAdvertiserSchema = z.object({
  legalName: z.string().trim().min(2).max(180),
  tradeName: z.string().trim().min(2).max(120),
  taxId: z.string().trim().min(3).max(40),
  businessCategory: z.string().trim().min(2).max(80).optional(),
  country: z
    .string()
    .length(2)
    .transform((value) => value.toUpperCase())
    .default('BO'),
  city: z.string().trim().min(2).max(80).optional(),
  websiteUrl: z.string().url().optional(),
  primaryContactName: z.string().trim().min(2).max(140).optional(),
  primaryContactEmail: z.string().email().optional(),
  billingMode: z.enum(billingModes).default('POSTPAID'),
  currency: currencySchema.default('BOB'),
  creditLimitMicros: microsSchema.default(0),
});

export const createBillingProfileSchema = z.object({
  fiscalName: z.string().trim().min(2).max(180),
  taxId: z.string().trim().min(3).max(40),
  billingEmail: z.string().email(),
  addressLine: z.string().trim().min(3).max(500).optional(),
  country: z
    .string()
    .length(2)
    .transform((value) => value.toUpperCase())
    .default('BO'),
  city: z.string().trim().min(2).max(80).optional(),
  taxRegime: z.string().trim().min(2).max(80).optional(),
  sinCustomerCode: z.string().trim().min(2).max(80).optional(),
  isDefault: z.boolean().default(true),
});

export const updateAdvertiserStatusSchema = z.object({
  status: z.enum(advertiserStatuses),
  riskStatus: z.enum(riskStatuses).optional(),
  reason: reasonSchema,
});

export const listCampaignsQuerySchema = withValidDateRange(
  paginationQuerySchema.extend({
    advertiserId: uuidSchema.optional(),
    status: z.enum(campaignStatuses).optional(),
    approvalStatus: z.enum(approvalStatuses).optional(),
    from: dateStringSchema.optional(),
    to: dateStringSchema.optional(),
  }),
);

export const updateCampaignStatusSchema = z.object({
  status: z.enum(campaignStatuses),
  reason: reasonSchema,
});

export const moderationQueueQuerySchema = paginationQuerySchema.extend({
  status: z.enum(moderationDecisions).default('PENDING_REVIEW'),
  advertiserId: uuidSchema.optional(),
  campaignId: uuidSchema.optional(),
});

export const moderationDecisionSchema = z.object({
  reviewStatus: z.enum(moderationDecisions).refine((value) => value !== 'PENDING_REVIEW', {
    message: 'La decisión debe ser aprobada, rechazada, cambios solicitados o escalada.',
  }),
  reasonCode: z.string().trim().min(3).max(80),
  notes: z.string().trim().min(3).max(1000).optional(),
  requiresAdvertiserChanges: z.boolean().default(false),
});

export const listInventoryQuerySchema = paginationQuerySchema.extend({
  surface: z.string().trim().min(2).max(80).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const createInventoryPlacementSchema = z.object({
  placementCode: z.string().trim().min(3).max(80),
  surface: z.string().trim().min(2).max(80),
  allowedFormats: z.array(z.string().trim().min(2).max(40)).min(1).max(10),
  floorPriceMicros: microsSchema.default(0),
  billingModel: z.enum(buyingModels).default('CPM'),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  widthPx: z.coerce.number().int().positive().optional(),
  heightPx: z.coerce.number().int().positive().optional(),
});

export const listPoliciesQuerySchema = paginationQuerySchema.extend({
  category: z.string().trim().min(2).max(80).optional(),
  isActive: z.coerce.boolean().optional(),
  severity: z.enum(auditSeverities).optional(),
});

export const createPolicyRuleSchema = z.object({
  policyCode: z.string().trim().min(3).max(100),
  category: z.string().trim().min(2).max(80),
  ruleType: z.enum(policyRuleTypes),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  description: z.string().trim().min(3).max(1000).optional(),
  isActive: z.boolean().default(true),
});

export const periodCloseSchema = withValidDateRange(
  z.object({
    periodStart: dateStringSchema,
    periodEnd: dateStringSchema,
    advertiserId: uuidSchema.optional(),
  }),
);

export const registerPaymentSchema = z.object({
  amountMicros: microsSchema.refine((value) => value > 0, 'El monto debe ser mayor a cero.'),
  currency: currencySchema.default('BOB'),
  paymentDate: dateStringSchema,
  paymentMethod: z.string().trim().min(2).max(40),
  reference: z.string().trim().min(2).max(120).optional(),
});

export const deliveryMonitorQuerySchema = withValidDateRange(
  paginationQuerySchema.extend({
    from: dateStringSchema.optional(),
    to: dateStringSchema.optional(),
    placementId: uuidSchema.optional(),
    status: z.enum(['BILLABLE', 'NON_BILLABLE', 'SUSPICIOUS']).optional(),
  }),
);

export const updateBillableStatusSchema = z.object({
  isBillable: z.boolean(),
  reason: reasonSchema,
});

export const auditQuerySchema = withValidDateRange(
  paginationQuerySchema.extend({
    entityType: z.string().trim().min(2).max(80).optional(),
    entityId: uuidSchema.optional(),
    actorId: uuidSchema.optional(),
    from: dateStringSchema.optional(),
    to: dateStringSchema.optional(),
    severity: z.enum(auditSeverities).optional(),
  }),
);

export const deliveryRequestSchema = z.object({
  placementCode: z.string().trim().min(3).max(80),
  corporateClientHash: z.string().trim().min(16).max(128).optional(),
  contextHash: z.string().trim().min(16).max(128).optional(),
  surface: z.string().trim().min(2).max(80).optional(),
});

export const trackEventSchema = z.object({
  eventType: z.enum(eventTypes),
  deliveryDecisionId: uuidSchema,
  requestId: uuidSchema.optional(),
  eventTime: isoDateTimeSchema.optional(),
  corporateClientHash: z.string().trim().min(16).max(128).optional(),
  sessionHash: z.string().trim().min(16).max(128).optional(),
  ipHash: z.string().trim().min(16).max(128).optional(),
  userAgentHash: z.string().trim().min(16).max(128).optional(),
  fraudScore: z.coerce.number().min(0).max(1).optional(),
  metadata: z.record(z.unknown()).default({}),
});

export const bulkTrackEventsSchema = z.object({
  batchExternalId: z.string().trim().min(1).max(160).optional(),
  items: z.array(trackEventSchema).min(1).max(500),
});

export const bulkCreateAdvertisersSchema = z
  .object({
    batchExternalId: z.string().trim().min(1).max(160).optional(),
    items: z.array(createAdvertiserSchema).min(1).max(100),
  })
  .superRefine((input, context) => {
    const keys = new Set<string>();
    input.items.forEach((item, index) => {
      const key = `${item.country}:${item.taxId}`.toUpperCase();
      if (keys.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'taxId'],
          message: 'No se permiten taxId duplicados dentro del mismo batch por país.',
        });
      }
      keys.add(key);
    });
  });
