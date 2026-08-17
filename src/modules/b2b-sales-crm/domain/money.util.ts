/**
 * El dinero se lleva en CÉNTIMOS ENTEROS, nunca en `number` decimal.
 *
 * `0.1 + 0.2 !== 0.3` es una curiosidad en un tutorial y un descuadre en una cartera: sumar cien
 * saldos con coma flotante deja un total que no cuadra contra el mayor, y el descuadre aparece en el
 * cierre sin forma de atribuirlo. Postgres guarda `numeric(18,2)` —exacto— y Sequelize lo devuelve
 * como STRING justamente para no perderlo al pasar por JavaScript. Estas funciones son la frontera:
 * se entra una vez, se opera en enteros, y se sale una vez.
 */
export function toCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  const text = typeof value === 'number' ? value.toFixed(2) : value.trim();
  if (text.length === 0) {
    return 0;
  }
  const negative = text.startsWith('-');
  const [wholePart = '0', fractionPart = ''] = text.replace(/^[+-]/, '').split('.');
  const whole = Number.parseInt(wholePart || '0', 10);
  const fraction = Number.parseInt(`${fractionPart}00`.slice(0, 2), 10);
  if (!Number.isFinite(whole) || !Number.isFinite(fraction)) {
    throw new Error(`Importe no numérico: ${String(value)}`);
  }
  const cents = whole * 100 + fraction;
  return negative ? -cents : cents;
}

/** Vuelve al texto decimal que espera `numeric(18,2)`. */
export function fromCents(cents: number): string {
  const rounded = Math.round(cents);
  const sign = rounded < 0 ? '-' : '';
  const absolute = Math.abs(rounded);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}

export function sumCents(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
