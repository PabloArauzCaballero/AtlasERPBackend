/**
 * Etiqueta de un año fiscal a partir de sus fechas.
 *
 * Se pedía a mano y quien la escribía podía poner «2026» a un año que va de julio a junio. Se deriva
 * del rango: el año calendario si empieza y termina en el mismo, o «inicio-fin» si lo cruza (el año
 * fiscal boliviano de algunas actividades va de abril a marzo).
 */
export function fiscalYearLabel(startDate: Date | string, endDate: Date | string): string {
  const yearOf = (value: Date | string): number =>
    value instanceof Date ? value.getUTCFullYear() : Number(String(value).slice(0, 4));
  const start = yearOf(startDate);
  const end = yearOf(endDate);
  return start === end ? String(start) : `${start}-${end}`;
}
