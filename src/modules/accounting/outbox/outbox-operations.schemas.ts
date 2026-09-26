import { z } from 'zod';

export const outboxEventKeyParamsSchema = z.object({
  eventKey: z.string().trim().min(1).max(160),
});
export type OutboxEventKeyParamsDto = z.infer<typeof outboxEventKeyParamsSchema>;

export const listDeadOutboxEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListDeadOutboxEventsQueryDto = z.infer<typeof listDeadOutboxEventsQuerySchema>;

/** El motivo queda en el registro de auditoría: un replay sin porqué no es revisable. */
export const replayOutboxEventSchema = z.object({
  reason: z.string().trim().min(10).max(500),
});
export type ReplayOutboxEventDto = z.infer<typeof replayOutboxEventSchema>;
