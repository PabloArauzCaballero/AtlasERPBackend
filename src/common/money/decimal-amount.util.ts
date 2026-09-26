/**
 * Aritmética exacta para importes `numeric(p, s)` de PostgreSQL.
 *
 * Sequelize devuelve las columnas DECIMAL como `string` justamente para no perder precisión.
 * Convertirlas a `number` y acumularlas con `+` introduce error de coma flotante (`0.1 + 0.2`),
 * lo que hace que los totales mostrados al comercio diverjan de los saldos contables. Todo el
 * cálculo se hace en unidades menores con `bigint` y solo se formatea al final.
 */

export const DEFAULT_AMOUNT_SCALE = 2;
const MAX_SUPPORTED_SCALE = 12;

/** Acepta enteros y decimales con signo; rechaza notación científica y separadores de miles. */
const AMOUNT_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

export class InvalidDecimalAmountError extends Error {
  constructor(value: unknown) {
    super(`Importe decimal inválido: ${typeof value === 'string' ? value : String(value)}`);
    this.name = 'InvalidDecimalAmountError';
  }
}

function assertScale(scale: number): void {
  if (!Number.isInteger(scale) || scale < 0 || scale > MAX_SUPPORTED_SCALE) {
    throw new RangeError(`La escala decimal debe ser un entero entre 0 y ${MAX_SUPPORTED_SCALE}.`);
  }
}

/**
 * Convierte un importe decimal a unidades menores (centavos con escala 2).
 * `null`/`undefined`/cadena vacía valen 0, que es la semántica de una columna nullable de importe.
 * Los dígitos por debajo de la escala se redondean media unidad hacia arriba en magnitud.
 */
export function toMinorUnits(value: unknown, scale: number = DEFAULT_AMOUNT_SCALE): bigint {
  assertScale(scale);

  if (value === null || value === undefined) return 0n;

  let text: string;
  if (typeof value === 'bigint') {
    text = value.toString();
  } else if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new InvalidDecimalAmountError(value);
    text = value.toFixed(scale);
  } else if (typeof value === 'string') {
    text = value.trim();
    if (text === '') return 0n;
  } else {
    throw new InvalidDecimalAmountError(value);
  }

  if (!AMOUNT_PATTERN.test(text)) throw new InvalidDecimalAmountError(text);

  const isNegative = text.startsWith('-');
  const unsigned = text.replace(/^[+-]/, '');
  const [integerPart = '', fractionPart = ''] = unsigned.split('.');
  const integerDigits = integerPart === '' ? '0' : integerPart;

  // Un dígito extra para decidir el redondeo.
  const padded = fractionPart.padEnd(scale + 1, '0');
  const keptDigits = padded.slice(0, scale);
  const roundingDigit = padded.charAt(scale);

  let minor = BigInt(`${integerDigits}${keptDigits}`);
  if (roundingDigit >= '5') minor += 1n;

  return isNegative ? -minor : minor;
}

/** Formatea unidades menores como cadena decimal con la escala indicada (sin separador de miles). */
export function fromMinorUnits(minor: bigint, scale: number = DEFAULT_AMOUNT_SCALE): string {
  assertScale(scale);

  const isNegative = minor < 0n;
  const absolute = isNegative ? -minor : minor;
  const digits = absolute.toString().padStart(scale + 1, '0');
  const integerPart = digits.slice(0, digits.length - scale);
  const fractionPart = scale === 0 ? '' : digits.slice(digits.length - scale);
  const sign = isNegative && absolute !== 0n ? '-' : '';

  return `${sign}${integerPart}${fractionPart ? `.${fractionPart}` : ''}`;
}

/** Suma exacta de importes decimales heterogéneos (string de Postgres, number, null). */
/*
 * Aquí vivían `sumMinorUnits`, `sumAmounts` e `isPositiveAmount`, y no los llamaba nadie.
 *
 * No se retiran por higiene sino porque MENTÍAN sobre cómo se suma dinero en este backend: quien
 * abriera este archivo leería que la forma sancionada de sumar importes es ésta, cuando el módulo
 * de CRM suma con `domain/money.util` —céntimos en `number`— y es el que de verdad se ejecuta.
 * Dos maneras de sumar dinero, una sin usar, es la clase de duplicidad que acaba en un descuadre
 * que nadie sabe atribuir. Si vuelve a hacer falta sumar aquí, se escribe entonces y con un
 * llamador delante.
 */

/** Normaliza un importe a su representación canónica con la escala indicada. */
export function normalizeAmount(value: unknown, scale: number = DEFAULT_AMOUNT_SCALE): string {
  return fromMinorUnits(toMinorUnits(value, scale), scale);
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Límite ÚNICO de conversión del dinero (P-07, 2026-09-24).
 *
 * Todo importe que entra a un camino financiero —cuerpo HTTP en `number`, columna `numeric` en
 * `string`— se convierte AQUÍ una sola vez a unidades menores `bigint`, se opera en enteros y sale
 * como cadena decimal con `fromMinorUnits`. Lo que no cabe en la regla se RECHAZA en vez de
 * redondearse en silencio: un importe con más decimales de los que admite su moneda, fuera del rango
 * de la columna o en una moneda sin escala conocida no es un dato que se pueda contabilizar.
 *
 * Decisiones (a ratificar por Finanzas, ver `docs/compliance/decisions.md` § P-07):
 *  - Redondeo: media unidad ALEJÁNDOSE DE CERO (`HALF_UP`), el mismo que ya aplicaba
 *    `toMinorUnits` y `Math.round` sobre positivos, para no cambiar ningún importe ya emitido.
 *  - Escala de tasas: 6 decimales (`numeric(9,6)` de `mdr_rules.rate_percent`).
 *  - Monedas: sólo las de la tabla; una moneda nueva se añade con su escala, nunca por defecto.
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

export type RoundingMode = 'HALF_UP' | 'HALF_EVEN';

/** Regla de redondeo del dinero en este backend. Cambiarla es una decisión de Finanzas. */
export const MONEY_ROUNDING_MODE: RoundingMode = 'HALF_UP';

/** Decimales de una tasa porcentual (`numeric(9,6)`): 1,234567 % se guarda como 1234567n. */
export const RATE_SCALE = 6;

/** Mayor importe que admite una columna `numeric(18,2)`: 9.999.999.999.999.999,99. */
export const NUMERIC_18_2_MAX_MINOR = 10n ** 18n - 1n;

/** Escala (decimales) de cada moneda admitida. Una moneda que no está aquí se rechaza. */
export const CURRENCY_MINOR_SCALE: Readonly<Record<string, number>> = Object.freeze({
  BOB: 2,
  USD: 2,
});

export class UnsupportedCurrencyError extends Error {
  constructor(currency: unknown) {
    super(`Moneda no admitida: ${String(currency)}`);
    this.name = 'UnsupportedCurrencyError';
  }
}

export class CurrencyMismatchError extends Error {
  constructor(readonly currencies: readonly string[]) {
    super(`No se pueden combinar importes de monedas distintas: ${currencies.join(', ')}`);
    this.name = 'CurrencyMismatchError';
  }
}

export class AmountOutOfRangeError extends Error {
  constructor(value: unknown, reason: string) {
    super(`Importe fuera de rango (${reason}): ${String(value)}`);
    this.name = 'AmountOutOfRangeError';
  }
}

/** Escala de la moneda; lanza si la moneda no está admitida. */
export function currencyScale(currency: string): number {
  const code = typeof currency === 'string' ? currency.trim().toUpperCase() : '';
  const scale = CURRENCY_MINOR_SCALE[code];
  if (scale === undefined) throw new UnsupportedCurrencyError(currency);
  return scale;
}

/** Devuelve la única moneda de la lista; lanza si hay dos distintas o si la lista está vacía. */
export function assertSingleCurrency(currencies: readonly string[]): string {
  const distinct = [...new Set(currencies.map((code) => code.trim().toUpperCase()))];
  if (distinct.length !== 1) throw new CurrencyMismatchError(distinct);
  currencyScale(distinct[0]!);
  return distinct[0]!;
}

/**
 * Texto decimal exacto de un valor de entrada.
 *
 * Un `number` de un cuerpo JSON trae el ruido binario de quien lo calculó (`0.1 + 0.2` llega como
 * `0.30000000000000004`). Se admite sólo si está a menos de una millonésima de unidad menor de un
 * valor con la escala pedida —es decir, si es ese valor mal representado— y sólo dentro del entero
 * seguro: por encima, un `number` ya no distingue céntimos y el importe debe viajar como texto.
 */
function exactDecimalText(value: unknown, scale: number): string {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new InvalidDecimalAmountError(value);
    const factor = 10 ** scale;
    const scaled = value * factor;
    if (Math.abs(scaled) > Number.MAX_SAFE_INTEGER) {
      throw new AmountOutOfRangeError(value, 'un number no representa céntimos a esta magnitud');
    }
    const nearest = Math.round(scaled);
    if (Math.abs(scaled - nearest) > 1e-6) {
      throw new AmountOutOfRangeError(value, `más de ${scale} decimales`);
    }
    return value.toFixed(scale);
  }
  throw new InvalidDecimalAmountError(value);
}

/**
 * Convierte a unidades menores SIN redondear: más decimales que `scale` (distintos de cero) es un
 * error, no un redondeo.
 */
export function parseDecimalExact(value: unknown, scale: number): bigint {
  assertScale(scale);
  const text = exactDecimalText(value, scale);
  if (!AMOUNT_PATTERN.test(text)) throw new InvalidDecimalAmountError(text);
  const fraction = text.replace(/^[+-]/, '').split('.')[1] ?? '';
  if (fraction.length > scale && /[1-9]/.test(fraction.slice(scale))) {
    throw new AmountOutOfRangeError(value, `más de ${scale} decimales`);
  }
  // Los dígitos por debajo de la escala son ceros: `toMinorUnits` no tiene nada que redondear.
  return toMinorUnits(text, scale);
}

export interface ParseMoneyOptions {
  currency?: string;
  allowNegative?: boolean;
  allowZero?: boolean;
  maxMinor?: bigint;
}

/** Importe monetario validado (moneda, escala, signo y rango de la columna) en unidades menores. */
export function parseMoney(value: unknown, options: ParseMoneyOptions = {}): bigint {
  const scale = currencyScale(options.currency ?? 'BOB');
  const minor = parseDecimalExact(value, scale);
  const max = options.maxMinor ?? NUMERIC_18_2_MAX_MINOR;
  if (minor < 0n && !options.allowNegative) throw new AmountOutOfRangeError(value, 'negativo');
  if (minor === 0n && options.allowZero === false) throw new AmountOutOfRangeError(value, 'cero');
  if (minor > max || -minor > max) throw new AmountOutOfRangeError(value, 'excede la columna');
  return minor;
}

/** Tasa porcentual (0–100 %) con hasta 6 decimales, en millonésimas de punto porcentual. */
export function parseRatePercent(value: unknown): bigint {
  const units = parseDecimalExact(value, RATE_SCALE);
  if (units < 0n || units > 100n * 10n ** BigInt(RATE_SCALE)) {
    throw new AmountOutOfRangeError(value, 'tasa fuera de 0–100 %');
  }
  return units;
}

/** División entera con la regla de redondeo indicada (denominador positivo). */
export function divideRounded(
  numerator: bigint,
  denominator: bigint,
  mode: RoundingMode = MONEY_ROUNDING_MODE,
): bigint {
  if (denominator <= 0n) throw new RangeError('El denominador debe ser positivo.');
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  let quotient = magnitude / denominator;
  const twiceRemainder = (magnitude % denominator) * 2n;
  if (
    twiceRemainder > denominator ||
    (twiceRemainder === denominator && (mode === 'HALF_UP' || quotient % 2n === 1n))
  ) {
    quotient += 1n;
  }
  return negative ? -quotient : quotient;
}

/** `importe × tasa %`, redondeado a la unidad menor: 1000,00 × 1,234567 % = 12,35. */
export function applyRatePercent(
  amountMinor: bigint,
  rateUnits: bigint,
  mode: RoundingMode = MONEY_ROUNDING_MODE,
): bigint {
  return divideRounded(amountMinor * rateUnits, 100n * 10n ** BigInt(RATE_SCALE), mode);
}

/** Suma exacta de unidades menores. */
export function sumMinor(values: readonly bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n);
}

/**
 * Reparte `total` en proporción a `weights` con suma EXACTA.
 *
 * Cada parte se trunca hacia cero y el residuo —los céntimos que el truncado dejó sin asignar— va
 * entero a la PRIMERA parte. La regla es determinista y auditable: con los mismos datos siempre
 * sale el mismo reparto, y la diferencia entre partes nunca supera lo que la división no podía
 * repartir. 100,00 en tres partes iguales = 33,34 + 33,33 + 33,33; 1.000,00 con pesos 4/3/3 =
 * 400,00 + 300,00 + 300,00.
 */
export function allocateProportionally(total: bigint, weights: readonly bigint[]): bigint[] {
  if (weights.length === 0) throw new RangeError('Se necesita al menos una parte.');
  if (weights.some((weight) => weight < 0n)) throw new RangeError('Pesos negativos.');
  const weightTotal = sumMinor(weights);
  if (weightTotal === 0n) throw new RangeError('La suma de pesos no puede ser cero.');
  const parts = weights.map((weight) => (total * weight) / weightTotal);
  parts[0] = parts[0]! + (total - sumMinor(parts));
  return parts;
}

/** Reparto en `count` partes iguales con el residuo en la primera. */
export function splitEvenly(total: bigint, count: number): bigint[] {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('Número de partes inválido.');
  return allocateProportionally(
    total,
    Array.from({ length: count }, () => 1n),
  );
}
