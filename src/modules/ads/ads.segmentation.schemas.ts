import { z } from 'zod';
import {
  checkAttributesAllowed,
  definitionSchemaFor,
} from '../../common/segmentation/rule-schema';
import {
  ATTRIBUTES_BY_SEGMENT_TYPE,
  AUDIENCE_ATTRIBUTES,
  SEGMENT_PRIVACY_LEVELS,
  SEGMENT_TYPES,
  requiredPrivacyLevel,
  type SegmentDefinition,
  type SegmentType,
} from './ads.segmentation';

/**
 * Validación del alta de segmentos y del contexto de audiencia que viaja en cada petición de
 * anuncio.
 *
 * La forma que exige cada operador se comprueba en `common/segmentation`, que es la misma para
 * toda segmentación del ERP; aquí queda lo que sólo vale para publicidad: el vocabulario, qué
 * atributos admite cada tipo de segmento y la derivación del nivel de privacidad.
 */

const definitionSchema = definitionSchemaFor(AUDIENCE_ATTRIBUTES);

export const createTargetSegmentSchema = z
  .object({
    advertiserId: z.string().uuid().optional(),
    name: z.string().trim().min(3).max(140),
    segmentType: z.enum(SEGMENT_TYPES),
    privacyLevel: z.enum(SEGMENT_PRIVACY_LEVELS).optional(),
    definition: definitionSchema,
  })
  .superRefine((input, context) => {
    checkAttributesAllowed(
      input.definition as SegmentDefinition,
      ATTRIBUTES_BY_SEGMENT_TYPE[input.segmentType as SegmentType],
      context,
      { label: input.segmentType, path: ['definition'] },
    );

    // El nivel de privacidad se DERIVA de lo que la definición mira. Si quien da de alta declara
    // uno más laxo que el que la regla exige, es un error y no una preferencia: sería etiquetar
    // como contextual un segmento que apunta a clientes concretos por su huella.
    const required = requiredPrivacyLevel(input.definition as SegmentDefinition);
    if (input.privacyLevel && input.privacyLevel !== required) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['privacyLevel'],
        message: `Esta definición exige privacyLevel ${required}.`,
      });
    }
  })
  .transform((input) => ({
    ...input,
    privacyLevel: requiredPrivacyLevel(input.definition as SegmentDefinition),
  }));

export const listTargetSegmentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
  advertiserId: z.string().uuid().optional(),
  segmentType: z.enum(SEGMENT_TYPES).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

/**
 * El contexto de audiencia que el ad server manda con cada petición.
 *
 * `.strict()` a propósito: un atributo que este vocabulario no conoce se RECHAZA en vez de
 * ignorarse en silencio. Ignorarlo dejaría a quien integra creyendo que segmenta por un dato que
 * el motor está tirando a la basura, que es la forma más cara de no segmentar.
 */
export const audienceContextSchema = z
  .object({
    merchantCategory: z.string().trim().min(1).max(160).optional(),
    city: z.string().trim().min(1).max(160).optional(),
    region: z.string().trim().min(1).max(160).optional(),
    country: z.string().trim().min(1).max(160).optional(),
    riskSegment: z.string().trim().min(1).max(160).optional(),
    monthlyVolumeBand: z.string().trim().min(1).max(160).optional(),
    merchantSizeBand: z.string().trim().min(1).max(160).optional(),
    surface: z.string().trim().min(1).max(160).optional(),
    tenureMonths: z.coerce.number().int().min(0).max(1200).optional(),
    corporateClientHash: z.string().trim().min(16).max(128).optional(),
  })
  .strict();
