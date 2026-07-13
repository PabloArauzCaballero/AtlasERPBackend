import { z } from 'zod';

const uuid = z.string().uuid();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const businessActionLogQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(25),
    moduleCode: z.string().trim().min(2).max(80).optional(),
    businessProcess: z.string().trim().min(2).max(120).optional(),
    actionCode: z.string().trim().min(2).max(120).optional(),
    status: z.enum(['SUCCESS', 'FAILED', 'PARTIAL']).optional(),
    aggregateType: z.string().trim().min(2).max(120).optional(),
    aggregateId: z.string().trim().min(1).max(120).optional(),
    actorUserId: uuid.optional(),
    correlationId: z.string().trim().min(1).max(160).optional(),
    from: dateOnly.optional(),
    to: dateOnly.optional(),
  })
  .refine((query) => !query.from || !query.to || query.to >= query.from, {
    path: ['to'],
    message: 'La fecha final no puede ser anterior a la fecha inicial.',
  });

export type BusinessActionLogQueryDto = z.infer<typeof businessActionLogQuerySchema>;
