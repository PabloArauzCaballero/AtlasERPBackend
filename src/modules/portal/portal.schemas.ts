import { z } from 'zod';

const uuid = z.string().uuid();

export const createPlanSchema = z.object({
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  tier: z.enum(['STARTER', 'STANDARD', 'PREMIUM', 'ENTERPRISE']).default('STANDARD'),
  monthlyPrice: z.coerce.number().min(0),
  currency: z.string().length(3).default('BOB'),
  features: z.array(z.string().trim().min(1).max(160)).default([]),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const subscribeSchema = z.object({
  merchantAccountId: uuid,
  planId: uuid,
  autoRenew: z.boolean().default(true),
});

export const subscriptionQuerySchema = z.object({ merchantAccountId: uuid });
export const branchesQuerySchema = z.object({ accountId: uuid });
export const campaignsQuerySchema = z.object({ advertiserId: uuid });
export const idParamsSchema = z.object({ id: uuid });
// Control acotado: el comercio solo puede prender/apagar campañas ya lanzadas.
export const setCampaignStatusSchema = z.object({ status: z.enum(['ACTIVE', 'PAUSED']) });

export type CreatePlanDto = z.infer<typeof createPlanSchema>;
export type SubscribeDto = z.infer<typeof subscribeSchema>;
export type SubscriptionQueryDto = z.infer<typeof subscriptionQuerySchema>;
export type BranchesQueryDto = z.infer<typeof branchesQuerySchema>;
export type CampaignsQueryDto = z.infer<typeof campaignsQuerySchema>;
export type IdParamsDto = z.infer<typeof idParamsSchema>;
export type SetCampaignStatusDto = z.infer<typeof setCampaignStatusSchema>;
