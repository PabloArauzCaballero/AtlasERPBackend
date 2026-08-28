/**
 * El motor de reglas que comparten todas las segmentaciones del ERP.
 *
 * Hasta aquí sólo existía una segmentación —la de audiencia publicitaria— y su gramática vivía
 * dentro del módulo de Ads. Al aparecer la segunda —clientes solicitantes de crédito y partners,
 * en CRM— copiar el evaluador habría creado dos motores que se parecen: el día que uno arregle la
 * comparación de texto y el otro no, el MISMO segmento incluiría a alguien en una pantalla y no en
 * la otra, y nadie sabría cuál de las dos miente.
 *
 * Lo que se comparte es EXACTAMENTE lo genérico: operadores, cómo se comparan los valores y cómo
 * se combinan las reglas. Lo que NO se comparte es el vocabulario: qué atributos puede mirar un
 * segmento es una decisión de cada dominio —y en publicidad es además una decisión de privacidad—,
 * así que cada módulo declara la suya y se la pasa a este motor.
 */

export const SEGMENT_OPERATORS = [
  'EQUALS',
  'NOT_EQUALS',
  'IN',
  'NOT_IN',
  'BETWEEN',
  'EXISTS',
] as const;
export type SegmentOperator = (typeof SEGMENT_OPERATORS)[number];

/**
 * De qué naturaleza es un atributo.
 *
 * - `TEXT` / `NUMBER`: un valor por sujeto.
 * - `HASH`: un identificador que sólo viaja hasheado y sólo sirve para pertenencia a una lista.
 * - `TEXT_LIST`: el sujeto puede tener VARIOS a la vez (los tags de una cuenta). Cambia lo que
 *   significa cada operador, y por eso es un tipo y no una convención.
 */
export type AttributeKind = 'TEXT' | 'NUMBER' | 'HASH' | 'TEXT_LIST';

/** Vocabulario de un dominio: qué atributo existe y de qué naturaleza es. */
export type AttributeVocabulary<TAttribute extends string = string> = Readonly<
  Record<TAttribute, AttributeKind>
>;

export interface SegmentRule<TAttribute extends string = string> {
  attribute: TAttribute;
  operator: SegmentOperator;
  value?: string | number | Array<string | number> | undefined;
}

export interface SegmentDefinition<TAttribute extends string = string> {
  match: 'ALL' | 'ANY';
  rules: Array<SegmentRule<TAttribute>>;
}

/** Lo que se sabe del sujeto que se está evaluando. Una lista significa «tiene varios». */
export type FactValue = string | number | ReadonlyArray<string | number>;
export type FactContext<TAttribute extends string = string> = Partial<
  Record<TAttribute, FactValue>
>;

/**
 * ¿Este sujeto cae dentro de la definición?
 *
 * Dos decisiones que gobiernan todo lo demás:
 *
 * 1. **Una definición SIN reglas no restringe nada.** Es la ausencia de criterio, no un criterio
 *    vacío que no cumple nadie.
 * 2. **Un atributo que no se sabe NO cumple la regla.** Es lo contrario de lo cómodo, y es
 *    deliberado: dando por cumplida la regla que no se puede comprobar, una proyección de hechos
 *    que dejara de traer el rubro haría que un segmento de farmacias pasara a incluir a todo el
 *    mundo sin que nada fallara. Fallando cerrado, el segmento se queda corto y alguien pregunta.
 */
export function matchesDefinition<TAttribute extends string>(
  definition: SegmentDefinition<TAttribute> | null | undefined,
  facts: FactContext<TAttribute> | null | undefined,
): boolean {
  if (!definition) return true;
  const { match, rules } = definition;
  if (rules.length === 0) return true;

  const context = facts ?? {};
  const results = rules.map((rule) => evaluateRule(rule, context));
  return match === 'ANY' ? results.some(Boolean) : results.every(Boolean);
}

export function evaluateRule<TAttribute extends string>(
  rule: SegmentRule<TAttribute>,
  facts: FactContext<TAttribute>,
): boolean {
  const actual = facts[rule.attribute];
  const known = isKnown(actual);
  if (rule.operator === 'EXISTS') return known;
  if (!known) return false;

  switch (rule.operator) {
    case 'EQUALS':
      return matchesAny(actual, [rule.value]);
    case 'NOT_EQUALS':
      return !matchesAny(actual, [rule.value]);
    case 'IN':
      return matchesAny(actual, toList(rule.value));
    case 'NOT_IN':
      return !matchesAny(actual, toList(rule.value));
    case 'BETWEEN':
      return isBetween(actual, rule.value);
    default:
      return false;
  }
}

/** Un hecho ausente, nulo o vacío es un hecho que no se sabe; una lista vacía también. */
function isKnown(actual: FactValue | undefined): actual is FactValue {
  if (actual === undefined || actual === null || actual === '') return false;
  return !Array.isArray(actual) || actual.length > 0;
}

/**
 * ¿Alguno de los valores esperados coincide con el hecho?
 *
 * Con un hecho de lista —los tags de una cuenta— «igual a X» significa «lleva el tag X»: exigir
 * que la lista entera sea X haría que un segmento por tag no encontrara nunca a una cuenta que
 * lleva dos, que es la mayoría.
 */
function matchesAny(actual: FactValue, expected: unknown[]): boolean {
  const actuals: ReadonlyArray<string | number> = Array.isArray(actual)
    ? (actual as ReadonlyArray<string | number>)
    : [actual as string | number];
  return actuals.some((one) => expected.some((candidate) => sameValue(one, candidate)));
}

/**
 * Comparación de texto insensible a mayúsculas y a espacios de los extremos.
 *
 * «FARMACIA», «Farmacia» y « farmacia » son el mismo rubro para cualquiera que lea la pantalla, y
 * una comparación exacta convierte una diferencia de tecleo en un segmento que no incluye a nadie
 * y que nadie sabe por qué. Los números se comparan como números: `'10'` y `10` son el mismo valor.
 */
function sameValue(actual: string | number, expected: unknown): boolean {
  if (typeof actual === 'number' || typeof expected === 'number') {
    return Number(actual) === Number(expected);
  }
  return normalize(String(actual)) === normalize(String(expected));
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function toList(value: unknown): Array<string | number> {
  return Array.isArray(value) ? (value as Array<string | number>) : [];
}

function isBetween(actual: FactValue, value: unknown): boolean {
  const bounds = toList(value);
  if (bounds.length !== 2 || Array.isArray(actual)) return false;
  const min = Number(bounds[0]);
  const max = Number(bounds[1]);
  const numeric = Number(actual);
  if (!Number.isFinite(numeric) || !Number.isFinite(min) || !Number.isFinite(max)) return false;
  return numeric >= min && numeric <= max;
}
