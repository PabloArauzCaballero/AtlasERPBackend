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
export function sumMinorUnits(
  values: readonly unknown[],
  scale: number = DEFAULT_AMOUNT_SCALE,
): bigint {
  return values.reduce<bigint>((total, value) => total + toMinorUnits(value, scale), 0n);
}

/** Suma exacta devuelta ya formateada como cadena decimal. */
export function sumAmounts(
  values: readonly unknown[],
  scale: number = DEFAULT_AMOUNT_SCALE,
): string {
  return fromMinorUnits(sumMinorUnits(values, scale), scale);
}

/** Normaliza un importe a su representación canónica con la escala indicada. */
export function normalizeAmount(value: unknown, scale: number = DEFAULT_AMOUNT_SCALE): string {
  return fromMinorUnits(toMinorUnits(value, scale), scale);
}

/** `true` si el importe es estrictamente mayor que cero. */
export function isPositiveAmount(value: unknown, scale: number = DEFAULT_AMOUNT_SCALE): boolean {
  return toMinorUnits(value, scale) > 0n;
}
