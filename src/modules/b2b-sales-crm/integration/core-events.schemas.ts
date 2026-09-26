/**
 * Contrato de entrada de los eventos de Core (contracts/atlas-integration-v1, sobre
 * `atlas.core.outbox/1`). Espejo en Zod del JSON Schema: las pruebas de conformidad pasan los MISMOS
 * fixtures por los dos, así que si divergen se ponen en rojo.
 */
import { z } from 'zod';

const coreId = z.string().regex(/^[1-9][0-9]{0,18}$/);
const isoDateTime = z
  .string()
  .regex(
    /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$/,
  );
const positiveDecimalAmount = z
  .string()
  .regex(/^[0-9]{1,16}(\.[0-9]{1,2})?$/)
  .refine((value) => /[1-9]/.test(value), 'El importe debe ser mayor que cero.');

export const coreEnvelopeSchema = z
  .object({
    spec: z.enum(['atlas.erp.outbox/1', 'atlas.core.outbox/1']),
    eventKey: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9._:-]+$/),
    topic: z
      .string()
      .max(120)
      .regex(/^[a-z0-9_]+(\.[a-z0-9_]+)+$/),
    schemaVersion: z.number().int().min(1),
    aggregate: z
      .object({
        type: z.string().min(1).max(80),
        id: z.string().min(1).max(120),
        version: z.number().int().min(1),
      })
      .strict(),
    occurredAt: isoDateTime,
    producer: z.enum(['atlas-erp', 'atlas-core']),
    tenantId: coreId.optional(),
    payload: z.record(z.unknown()),
  })
  .strict();
export type CoreEnvelope = z.infer<typeof coreEnvelopeSchema>;

const claimShape = {
  claimId: coreId,
  claimCode: z.string().min(1).max(80),
  loanId: coreId,
  installmentId: coreId,
  customerId: coreId,
  partnerProfileId: coreId.nullable(),
  amount: positiveDecimalAmount,
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  aggregateVersion: z.number().int().min(1),
};

export const paymentReportedSchema = z.object(claimShape).strict();
export const paymentConfirmedSchema = z
  .object({ ...claimShape, decidedAt: isoDateTime, loanPaymentId: coreId })
  .strict();
export const paymentRejectedSchema = z
  .object({ ...claimShape, decidedAt: isoDateTime, reason: z.string().max(500).nullable() })
  .strict();

export type PaymentReported = z.infer<typeof paymentReportedSchema>;
export type PaymentConfirmed = z.infer<typeof paymentConfirmedSchema>;
export type PaymentRejected = z.infer<typeof paymentRejectedSchema>;

/**
 * T-11 (2026-09-26): la banda de riesgo con la que Core aprobó un crédito, para que la regla de
 * MDR por banda case en el registro de la compra. `aggregate.type` es `credit_application`, no una
 * cuota — a diferencia de `payment.*`, este evento no tiene forma de "claim".
 */
export const creditDecisionRecordedSchema = z
  .object({
    customerId: coreId,
    riskBand: z.enum(['A', 'B', 'C', 'D']),
    decidedAt: isoDateTime,
    applicationCode: z.string().min(1).max(80),
  })
  .strict();
export type CreditDecisionRecorded = z.infer<typeof creditDecisionRecordedSchema>;

/** Tópicos de Core que el ERP consume, con la versión de esquema que entiende. */
export const CONSUMED_CORE_TOPICS = {
  'payment.reported': { schemaVersion: 1, payload: paymentReportedSchema },
  'payment.confirmed': { schemaVersion: 1, payload: paymentConfirmedSchema },
  'payment.rejected': { schemaVersion: 1, payload: paymentRejectedSchema },
  'credit.decision.recorded': { schemaVersion: 1, payload: creditDecisionRecordedSchema },
} as const;
export type ConsumedCoreTopic = keyof typeof CONSUMED_CORE_TOPICS;

export function isConsumedCoreTopic(topic: string): topic is ConsumedCoreTopic {
  return Object.prototype.hasOwnProperty.call(CONSUMED_CORE_TOPICS, topic);
}
