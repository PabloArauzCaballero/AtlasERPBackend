import { z } from 'zod';
import {
  PORTAL_DEFAULT_PAGE_SIZE,
  PORTAL_MAX_PAGE_SIZE,
  PORTAL_TOGGLEABLE_CAMPAIGN_STATUSES,
} from './portal.constants';

const uuid = z.string().uuid();

/**
 * Los identificadores de cuenta y anunciante son OPCIONALES a propósito.
 *
 * Para un usuario del comercio el alcance se deriva de sus membresías (`PortalScopeService`), así
 * que enviarlos es innecesario y, cuando se envían, se validan contra ese alcance. Se mantienen
 * admitidos para el staff interno, que sí opera en nombre de un comercio concreto, y para no
 * romper a los clientes existentes que ya los envían.
 */
const optionalAccountId = uuid.optional();

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(PORTAL_MAX_PAGE_SIZE)
    .default(PORTAL_DEFAULT_PAGE_SIZE),
});

export const createPlanSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Z0-9_]+$/, 'El código solo admite mayúsculas, dígitos y guion bajo.'),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  tier: z.enum(['STARTER', 'STANDARD', 'PREMIUM', 'ENTERPRISE']).default('STANDARD'),
  // Se valida como decimal de 2 posiciones: el precio va a `numeric(18,2)` y un flotante con más
  // decimales se redondearía en silencio contra lo que aprobó el área comercial.
  monthlyPrice: z.coerce.number().min(0).max(9_999_999_999).multipleOf(0.01),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase())
    .refine((value) => /^[A-Z]{3}$/.test(value), 'La moneda debe ser un código ISO de 3 letras.')
    .default('BOB'),
  features: z.array(z.string().trim().min(1).max(160)).max(40).default([]),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
});

export const subscribeSchema = z.object({
  merchantAccountId: optionalAccountId,
  planId: uuid,
  autoRenew: z.boolean().default(true),
});

export const subscriptionQuerySchema = z.object({ merchantAccountId: optionalAccountId });

export const branchesQuerySchema = paginationSchema.extend({
  // `accountId` es el nombre histórico del parámetro en este endpoint.
  accountId: optionalAccountId,
});

export const plansQuerySchema = paginationSchema.extend({
  // Se mantiene como enum textual (y no como transformación a booleano) para que el esquema
  // conserve el mismo tipo de entrada y de salida, que es lo que exige `ZodValidationPipe`.
  includeInactive: z.enum(['true', 'false']).default('false'),
});

export const advertisersQuerySchema = paginationSchema.extend({
  merchantAccountId: optionalAccountId,
});

export const campaignsQuerySchema = paginationSchema.extend({
  advertiserId: uuid,
});

export const idParamsSchema = z.object({ id: uuid });

/** Control acotado: el comercio solo puede prender/apagar campañas ya lanzadas. */
export const setCampaignStatusSchema = z.object({
  status: z.enum(PORTAL_TOGGLEABLE_CAMPAIGN_STATUSES),
  reason: z.string().trim().min(8).max(500).optional(),
});

export type CreatePlanDto = z.infer<typeof createPlanSchema>;
export type SubscribeDto = z.infer<typeof subscribeSchema>;
export type SubscriptionQueryDto = z.infer<typeof subscriptionQuerySchema>;
export type BranchesQueryDto = z.infer<typeof branchesQuerySchema>;
export type PlansQueryDto = z.infer<typeof plansQuerySchema>;
export type AdvertisersQueryDto = z.infer<typeof advertisersQuerySchema>;
export type CampaignsQueryDto = z.infer<typeof campaignsQuerySchema>;
export type IdParamsDto = z.infer<typeof idParamsSchema>;
export type SetCampaignStatusDto = z.infer<typeof setCampaignStatusSchema>;
