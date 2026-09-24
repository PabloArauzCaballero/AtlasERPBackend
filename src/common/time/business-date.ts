/**
 * Fecha de negocio de ATLAS: el día calendario en Bolivia (America/La_Paz, UTC−4 sin horario de
 * verano), NO el día UTC.
 *
 * Antes cada proceso cortaba el día con `new Date().toISOString().slice(0, 10)`, que es el día en
 * UTC: entre las 20:00 y la medianoche de La Paz ya es «mañana», así que una cuota que vence hoy
 * figuraba vencida cuatro horas antes de que termine el día en que el consumidor todavía podía
 * pagarla. Esta es la ÚNICA política de corte: la usan el barrido de mora y la elegibilidad de
 * cobertura, y cualquier regla nueva que dependa de «hoy» debe pasar por aquí.
 */
export const BUSINESS_TIME_ZONE = 'America/La_Paz';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Día de negocio (`YYYY-MM-DD`) en Bolivia para el instante dado. */
export function businessDate(now: Date = new Date()): string {
  const parts = formatter.formatToParts(now);
  const pick = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

/**
 * Una cuota está vencida cuando su fecha de vencimiento es ANTERIOR al día de negocio: el día del
 * vencimiento entero es todavía plazo de pago.
 */
export function isPastDue(dueDate: string, today: string): boolean {
  return dueDate < today;
}

/** Suma días a una fecha `YYYY-MM-DD` (aritmética de calendario, sin zona). */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}
