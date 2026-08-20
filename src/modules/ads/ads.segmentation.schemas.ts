import { z } from 'zod';
import {
  ATTRIBUTES_BY_SEGMENT_TYPE,
  AUDIENCE_ATTRIBUTES,
  SEGMENT_OPERATORS,
  SEGMENT_PRIVACY_LEVELS,
  SEGMENT_TYPES,
  requiredPrivacyLevel,
  type AudienceAttribute,
  type SegmentDefinition,
  type SegmentType,
} from './ads.segmentation';

/**
 * Validación del alta de segmentos y del contexto de audiencia que viaja en cada petición de
 * anuncio.
 *
 * Aquí es donde una definición mal formada se rechaza en el borde, con un mensaje que dice qué
 * atributo sobra, en vez de guardarse en JSONB y descubrirse meses después como una campaña que
 * "no entrega y no se sabe por qué".
 */

const attributeNames = Object.keys(AUDIENCE_ATTRIBUTES) as [
  AudienceAttribute,
  ...AudienceAttribute[],
];

const scalarValueSchema = z.union([z.string().trim().min(1).max(160), z.number()]);

const segmentRuleSchema = z.object({
  attribute: z.enum(attributeNames),
  operator: z.enum(SEGMENT_OPERATORS),
  value: z.union([scalarValueSchema, z.array(scalarValueSchema).min(1).max(200)]).optional(),
});

/**
 * Cada operador exige una forma de `value` distinta, y comprobarlo aquí evita reglas que existen
 * pero no pueden cumplirse nunca: un `IN` sin lista no rechaza a nadie —parece un filtro y no
 * filtra— y un `BETWEEN` con un solo extremo tampoco.
 */
const definitionSchema = z
  .object({
    match: z.enum(['ALL', 'ANY']).default('ALL'),
    rules: z.array(segmentRuleSchema).min(1).max(20),
  })
  .superRefine((definition, context) => {
    definition.rules.forEach((rule, index) => {
      const path = ['rules', index, 'value'];
      const isList = Array.isArray(rule.value);

      if (rule.operator === 'EXISTS') {
        if (rule.value !== undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path,
            message: 'El operador EXISTS no lleva valor.',
          });
        }
        return;
      }
      if (rule.value === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `El operador ${rule.operator} exige un valor.`,
        });
        return;
      }
      if ((rule.operator === 'IN' || rule.operator === 'NOT_IN') && !isList) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `El operador ${rule.operator} exige una lista de valores.`,
        });
      }
      if (rule.operator === 'BETWEEN') {
        const bounds = Array.isArray(rule.value) ? rule.value : [];
        const numeric = bounds.every((bound) => Number.isFinite(Number(bound)));
        if (bounds.length !== 2 || !numeric) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path,
            message: 'BETWEEN exige exactamente dos límites numéricos.',
          });
        }
        if (AUDIENCE_ATTRIBUTES[rule.attribute] !== 'NUMBER') {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['rules', index, 'operator'],
            message: `BETWEEN sólo aplica a atributos numéricos; ${rule.attribute} no lo es.`,
          });
        }
      }
      if ((rule.operator === 'EQUALS' || rule.operator === 'NOT_EQUALS') && isList) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `El operador ${rule.operator} lleva un único valor; usa IN para una lista.`,
        });
      }
    });
  });

export const createTargetSegmentSchema = z
  .object({
    advertiserId: z.string().uuid().optional(),
    name: z.string().trim().min(3).max(140),
    segmentType: z.enum(SEGMENT_TYPES),
    privacyLevel: z.enum(SEGMENT_PRIVACY_LEVELS).optional(),
    definition: definitionSchema,
  })
  .superRefine((input, context) => {
    const allowed = ATTRIBUTES_BY_SEGMENT_TYPE[input.segmentType as SegmentType];
    input.definition.rules.forEach((rule, index) => {
      if (!allowed.includes(rule.attribute)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['definition', 'rules', index, 'attribute'],
          message: `Un segmento ${input.segmentType} no puede mirar "${rule.attribute}". Admite: ${allowed.join(', ')}.`,
        });
      }
    });

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
