import { z } from 'zod';

const variables = z.record(z.unknown()).default({});
export const sendCampaignEmailSchema = z.object({
  campaignId: z.string().uuid(),
  subject: z.string().trim().min(1).max(500),
  htmlBody: z.string().trim().min(1).max(250_000),
  textBody: z.string().trim().max(250_000).optional(),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  variables,
  recipients: z
    .array(
      z.object({
        email: z.string().trim().email().max(255),
        referenceId: z.string().trim().max(120).optional(),
        name: z.string().trim().max(180).optional(),
        variables,
      }),
    )
    .min(1)
    .max(500),
});
export const emailTrackingParamSchema = z.object({ trackingId: z.string().uuid() });
export const createEmailSuppressionSchema = z.object({
  email: z.string().trim().email().max(255),
  reason: z.enum(['UNSUBSCRIBE', 'HARD_BOUNCE', 'SPAM_REPORT', 'MANUAL']),
  details: z.string().trim().max(2000).optional(),
});
export type SendCampaignEmailDto = z.infer<typeof sendCampaignEmailSchema>;
export type CreateEmailSuppressionDto = z.infer<typeof createEmailSuppressionSchema>;
