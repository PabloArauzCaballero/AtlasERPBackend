import { z } from 'zod';
import { buyingModels, campaignObjectives, creativeTypes } from './ads.enums';

/**
 * Alta de la cadena publicitaria: campaña → conjunto de anuncios → creatividad → anuncio.
 *
 * El módulo sabía listar campañas, abrirlas y cambiarles el estado, pero no CREARLAS: no había
 * `POST` de campaña ni de ninguna de las piezas que cuelgan de ella, así que la única forma de que
 * existiera una campaña era sembrarla por SQL. Todo el aparato de moderación, entrega, eventos y
 * facturación operaba sobre algo que el producto no permitía dar de alta.
 *
 * Nada de esto nace aprobado. Una campaña se crea en `DRAFT` y con `approval_status`
 * `NOT_SUBMITTED`; que llegue a entregarse sigue dependiendo de la moderación, que ya existía. Un
 * alta que naciera `ACTIVE`/`APPROVED` convertiría el circuito de revisión en decorativo.
 */

const uuidSchema = z.string().uuid();
const microsSchema = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const isoDateTimeSchema = z.string().datetime({ offset: true });

const withEndAfterStart = <TSchema extends z.ZodTypeAny>(schema: TSchema): TSchema =>
  schema.refine(
    (value) => {
      const candidate = value as { startsAt?: string; endsAt?: string | null };
      if (!candidate.startsAt || !candidate.endsAt) return true;
      return new Date(candidate.endsAt) > new Date(candidate.startsAt);
    },
    { message: 'La fecha de fin debe ser posterior a la de inicio.', path: ['endsAt'] },
  ) as unknown as TSchema;

export const createCampaignSchema = withEndAfterStart(
  z
    .object({
      advertiserId: uuidSchema,
      name: z.string().trim().min(3).max(140),
      objective: z.enum(campaignObjectives),
      currency: z
        .string()
        .length(3)
        .transform((value) => value.toUpperCase()),
      // El presupuesto total tiene que ser positivo: lo exige `ck_campaign_budget` en la base, y
      // comprobarlo aquí devuelve un 400 explicando el campo en vez de un error del driver.
      budgetTotalMicros: microsSchema.refine((value) => value > 0, {
        message: 'El presupuesto total debe ser mayor que cero.',
      }),
      budgetDailyMicros: microsSchema.optional(),
      startsAt: isoDateTimeSchema,
      endsAt: isoDateTimeSchema.nullish(),
    })
    .superRefine((input, context) => {
      // Un tope diario por encima del total describe un presupuesto que no existe: el gasto se
      // corta en el total, así que el diario nunca llegaría a aplicarse y la pantalla mostraría un
      // límite que no limita.
      if (input.budgetDailyMicros && input.budgetDailyMicros > input.budgetTotalMicros) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['budgetDailyMicros'],
          message: 'El presupuesto diario no puede superar al total.',
        });
      }
    }),
);

export const createAdSetSchema = withEndAfterStart(
  z
    .object({
      name: z.string().trim().min(3).max(140),
      buyingModel: z.enum(buyingModels),
      bidAmountMicros: microsSchema,
      dailyBudgetMicros: microsSchema.optional(),
      targetSegmentId: uuidSchema.nullish(),
      // Las dos mitades del tope de frecuencia van juntas o no van: la consulta de elegibilidad
      // sólo aplica el límite cuando ambas están, así que declarar una sola deja al ad set
      // pareciendo acotado sin estarlo.
      frequencyCapCount: z.coerce.number().int().positive().max(1000).optional(),
      frequencyCapWindowHours: z.coerce.number().int().positive().max(8760).optional(),
      placementIds: z.array(uuidSchema).min(1).max(50),
      startsAt: isoDateTimeSchema.nullish(),
      endsAt: isoDateTimeSchema.nullish(),
    })
    .superRefine((input, context) => {
      const declaredCount = input.frequencyCapCount !== undefined;
      const declaredWindow = input.frequencyCapWindowHours !== undefined;
      if (declaredCount !== declaredWindow) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [declaredCount ? 'frequencyCapWindowHours' : 'frequencyCapCount'],
          message: 'El tope de frecuencia exige cantidad Y ventana; una sola no se aplica.',
        });
      }
      if (input.buyingModel !== 'FIXED' && input.bidAmountMicros <= 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bidAmountMicros'],
          message: 'Una puja de cero nunca gana una subasta; sólo FIXED admite importe cero.',
        });
      }
      const unique = new Set(input.placementIds);
      if (unique.size !== input.placementIds.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['placementIds'],
          message: 'Hay espacios repetidos.',
        });
      }
    }),
);

export const createCreativeSchema = z.object({
  advertiserId: uuidSchema,
  name: z.string().trim().min(3).max(140),
  creativeType: z.enum(creativeTypes),
  headline: z.string().trim().min(1).max(160).optional(),
  bodyText: z.string().trim().min(1).max(2000).optional(),
  ctaText: z.string().trim().min(1).max(60).optional(),
  // Sólo http(s). Un `javascript:` en el destino de un anuncio es ejecución en el navegador de
  // quien lo pulsa, y este campo termina pintado como enlace en el portal.
  destinationUrl: z
    .string()
    .trim()
    .url()
    .max(2000)
    .refine((value) => /^https?:\/\//i.test(value), {
      message: 'El destino debe ser una URL http o https.',
    }),
});

export const createAdSchema = z.object({
  creativeId: uuidSchema,
  name: z.string().trim().min(3).max(140),
  weight: z.coerce.number().int().min(1).max(1000).default(1),
  trackingTemplate: z.string().trim().max(2000).optional(),
});

export const adSetIdParamSchema = z.object({ adSetId: uuidSchema });
export const segmentIdParamSchema = z.object({ segmentId: uuidSchema });

export const campaignPerformanceQuerySchema = z
  .object({
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    groupBy: z.enum(['CAMPAIGN', 'AD_SET', 'AD', 'DAY']).default('CAMPAIGN'),
  })
  .refine((value) => !value.from || !value.to || value.to >= value.from, {
    message: 'La fecha fin no puede ser anterior a la fecha inicio.',
    path: ['to'],
  });
