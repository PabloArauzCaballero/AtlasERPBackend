import { z } from 'zod';
import { SEGMENT_OPERATORS, type AttributeVocabulary, type SegmentDefinition } from './rule-engine';

/**
 * Validación de una definición de segmento, para el vocabulario que se le pase.
 *
 * Aquí es donde una definición mal formada se rechaza en el borde, con un mensaje que dice qué
 * atributo sobra, en vez de guardarse en JSONB y descubrirse meses después como un segmento que
 * «no alcanza a nadie y no se sabe por qué».
 *
 * Es una fábrica y no un esquema fijo porque el vocabulario es de cada dominio: publicidad admite
 * atributos del negocio del comercio, y CRM admite los del solicitante de crédito o los del
 * partner. Lo que NO cambia entre dominios es la forma que exige cada operador, y eso vive una
 * sola vez.
 */
export function definitionSchemaFor(attributes: AttributeVocabulary) {
  const attributeNames = Object.keys(attributes) as [string, ...string[]];
  const scalarValueSchema = z.union([z.string().trim().min(1).max(160), z.number()]);

  const segmentRuleSchema = z.object({
    attribute: z.enum(attributeNames),
    operator: z.enum(SEGMENT_OPERATORS),
    value: z.union([scalarValueSchema, z.array(scalarValueSchema).min(1).max(200)]).optional(),
  });

  /*
   * Cada operador exige una forma de `value` distinta, y comprobarlo aquí evita reglas que existen
   * pero no pueden cumplirse nunca: un `IN` sin lista no rechaza a nadie —parece un filtro y no
   * filtra— y un `BETWEEN` con un solo extremo tampoco.
   */
  return z
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
          if (attributes[rule.attribute] !== 'NUMBER') {
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
}

/**
 * Comprueba que cada regla mire un atributo que ESE tipo de segmento admite.
 *
 * El tipo no es una etiqueta decorativa: es lo que hace que un segmento llamado «GEO» no pueda
 * colar una regla sobre el volumen facturado, y que revisar el catálogo sea leer cinco reglas en
 * vez de auditar cada documento JSON uno por uno.
 */
export function checkAttributesAllowed(
  definition: SegmentDefinition,
  allowed: readonly string[],
  context: z.RefinementCtx,
  options: { readonly label: string; readonly path: readonly (string | number)[] },
): void {
  definition.rules.forEach((rule, index) => {
    if (!allowed.includes(rule.attribute)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...options.path, 'rules', index, 'attribute'],
        message: `Un segmento ${options.label} no puede mirar "${rule.attribute}". Admite: ${allowed.join(', ')}.`,
      });
    }
  });
}
