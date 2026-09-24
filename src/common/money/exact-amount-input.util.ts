/**
 * Validación de importes que ENTRAN por la API, sin pasar por coma flotante.
 *
 * `decimal-amount.util.ts` redondea los dígitos que sobran de la escala: correcto para normalizar
 * lo que ya está en la base, peligroso para lo que manda un cliente, porque `100.005` se
 * convertiría en silencio en `100.01`. Un importe de dinero con más decimales que la moneda es un
 * error del que lo envía y se rechaza.
 *
 * Acepta cadena (preferida) o número JSON; un número se lee por su representación decimal más
 * corta (`String(n)`), así que `0.1 + 0.2` —`0.30000000000000004`— se rechaza en vez de truncarse.
 */
import { DEFAULT_AMOUNT_SCALE, normalizeAmount } from './decimal-amount.util';

/** `numeric(18,2)`: 16 dígitos enteros. */
export const MAX_INTEGER_DIGITS = 16;

/**
 * Devuelve el importe canónico (`"100.00"`) o `null` si no es un importe positivo exacto con, como
 * mucho, `scale` decimales y `MAX_INTEGER_DIGITS` enteros.
 */
export function parseExactPositiveAmount(
  value: unknown,
  scale: number = DEFAULT_AMOUNT_SCALE,
): string | null {
  let text: string;
  if (typeof value === 'string') text = value.trim();
  else if (typeof value === 'number' && Number.isFinite(value)) text = String(value);
  else return null;

  const pattern = new RegExp(`^(\\d{1,${MAX_INTEGER_DIGITS}})(?:\\.(\\d{1,${scale}}))?$`);
  if (!pattern.test(text)) return null;

  const normalized = normalizeAmount(text, scale);
  return /^0+(?:\.0+)?$/.test(normalized) ? null : normalized;
}
