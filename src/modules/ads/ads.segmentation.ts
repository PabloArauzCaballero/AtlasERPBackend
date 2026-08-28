import {
  matchesDefinition,
  type AttributeVocabulary,
  type FactContext,
  type SegmentDefinition as GenericSegmentDefinition,
  type SegmentRule as GenericSegmentRule,
} from '../../common/segmentation/rule-engine';

export { SEGMENT_OPERATORS, type SegmentOperator } from '../../common/segmentation/rule-engine';

/**
 * Gramática de segmentación publicitaria: qué puede mirar un segmento y cómo se evalúa.
 *
 * `ad_target_segments.definition_json` es una columna JSONB que hasta ahora aceptaba CUALQUIER
 * cosa: no había esquema que la validara ni código que la leyera. Un segmento era un documento
 * libre que nadie interpretaba, y `ad_ad_sets.target_segment_id` una llave foránea que la consulta
 * de elegibilidad ni mencionaba — de modo que un conjunto de anuncios "segmentado" se entregaba a
 * todo el mundo, exactamente igual que uno sin segmentar, y sin una sola señal de que la
 * segmentación no estuviera aplicándose.
 *
 * Este archivo cierra las dos mitades del agujero: define el vocabulario admisible y lo evalúa.
 * La evaluación en sí —los operadores y cómo se comparan los valores— vive en
 * `common/segmentation`, compartida con la segmentación comercial de CRM: son dos catálogos
 * distintos sobre el MISMO motor, y no dos motores que se parecen.
 *
 * ## Por qué una lista CERRADA de atributos
 *
 * Un `definition_json` libre permite escribir `{"attribute":"cedula"}` y que el día que alguien
 * mande ese dato en la petición, el segmento empiece a discriminar por identidad de una persona
 * sin que nadie lo haya aprobado. Con la lista cerrada, un atributo que no esté aquí es un error
 * de validación en el alta del segmento, no una sorpresa en producción.
 */

/**
 * Atributos de audiencia que un segmento puede mirar, con su tipo.
 *
 * Son deliberadamente atributos del NEGOCIO del comercio y del contexto de la petición —rubro,
 * ciudad, banda de volumen—, nunca de una persona. El único identificador admitido viaja hasheado
 * y sólo sirve para pertenencia a una lista.
 */
export const AUDIENCE_ATTRIBUTES = {
  merchantCategory: 'TEXT',
  city: 'TEXT',
  region: 'TEXT',
  country: 'TEXT',
  riskSegment: 'TEXT',
  monthlyVolumeBand: 'TEXT',
  merchantSizeBand: 'TEXT',
  surface: 'TEXT',
  tenureMonths: 'NUMBER',
  corporateClientHash: 'HASH',
} as const satisfies AttributeVocabulary;

export type AudienceAttribute = keyof typeof AUDIENCE_ATTRIBUTES;
export type AudienceContext = FactContext<AudienceAttribute> &
  Partial<Record<AudienceAttribute, string | number>>;

export const SEGMENT_TYPES = [
  'CORPORATE_CONTEXTUAL',
  'MERCHANT_CATEGORY',
  'GEO',
  'CUSTOM_ALLOWLIST',
  'LOOKUP_STATIC',
] as const;
export type SegmentType = (typeof SEGMENT_TYPES)[number];

export const SEGMENT_PRIVACY_LEVELS = [
  'CORPORATE_CONTEXTUAL',
  'AGGREGATED',
  'HASHED_ALLOWLIST',
] as const;
export type SegmentPrivacyLevel = (typeof SEGMENT_PRIVACY_LEVELS)[number];

/**
 * Qué atributos admite cada tipo de segmento.
 *
 * El tipo no es una etiqueta decorativa: es lo que hace que un segmento llamado "GEO" no pueda
 * colar una regla sobre el volumen facturado, y que revisar el catálogo de segmentos sea leer
 * cinco reglas en vez de auditar cada documento JSON uno por uno.
 */
export const ATTRIBUTES_BY_SEGMENT_TYPE: Record<SegmentType, readonly AudienceAttribute[]> = {
  MERCHANT_CATEGORY: ['merchantCategory'],
  GEO: ['city', 'region', 'country'],
  CORPORATE_CONTEXTUAL: [
    'merchantCategory',
    'riskSegment',
    'monthlyVolumeBand',
    'merchantSizeBand',
    'tenureMonths',
    'surface',
  ],
  CUSTOM_ALLOWLIST: ['corporateClientHash'],
  LOOKUP_STATIC: ['merchantCategory', 'city', 'region', 'country', 'surface'],
};

export type SegmentRule = GenericSegmentRule<AudienceAttribute>;
export type SegmentDefinition = GenericSegmentDefinition<AudienceAttribute>;

export interface EvaluableSegment {
  segmentType: SegmentType;
  definitionJson: SegmentDefinition;
}

/**
 * El nivel de privacidad que EXIGE una definición, derivado de lo que mira y no de lo que declara
 * quien la da de alta.
 *
 * Cualquier regla sobre un atributo hasheado apunta a un cliente concreto —aunque sea por su
 * huella—, así que arrastra el nivel más estricto. Declararlo aparte y confiar en el declarante
 * convierte el campo en una casilla que siempre dice lo que conviene.
 */
export function requiredPrivacyLevel(definition: SegmentDefinition): SegmentPrivacyLevel {
  const usesHash = definition.rules.some((rule) => AUDIENCE_ATTRIBUTES[rule.attribute] === 'HASH');
  return usesHash ? 'HASHED_ALLOWLIST' : 'CORPORATE_CONTEXTUAL';
}

/**
 * ¿Esta audiencia cae dentro del segmento?
 *
 * Un conjunto de anuncios SIN segmento (`null`) entrega a todo el mundo: es la ausencia de
 * restricción, no una restricción vacía.
 *
 * Las reglas se evalúan a la defensiva: **un atributo que la petición no manda NO cumple la
 * regla**. Es la decisión que más consecuencias tiene de toda la segmentación. Al revés —dar por
 * cumplida la regla que no se puede comprobar— un ad server que dejara de enviar el contexto
 * seguiría entregando, y una campaña restringida a farmacias de Santa Cruz pasaría a servirse a
 * todo el país sin que nada fallara ni apareciera en ningún tablero. Fallando cerrado, el síntoma
 * es visible de inmediato: la campaña deja de entregar y alguien pregunta por qué.
 */
export function audienceMatchesSegment(
  segment: EvaluableSegment | null | undefined,
  audience: AudienceContext | undefined,
): boolean {
  return matchesDefinition(segment?.definitionJson, audience);
}
