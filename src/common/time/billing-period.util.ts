/**
 * Aritmética de períodos de facturación.
 *
 * `Date.prototype.setMonth` desborda al mes siguiente cuando el día de origen no existe en el mes
 * destino: 31-ene + 1 mes produce 3-mar (o 2-mar en año bisiesto), y 31-may + 1 mes produce 1-jul.
 * Aplicado al cierre de período de una suscripción, eso adelanta o atrasa el corte de facturación
 * varios días para todas las altas ocurridas los días 29, 30 y 31. Aquí el día se recorta al último
 * día real del mes destino y el cálculo se hace en UTC para no depender del huso del proceso.
 */

/** Último día (1-31) del mes indicado, con `monthIndex` en base 0. */
export function lastDayOfUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Suma meses conservando la hora y recortando el día al último día válido del mes destino.
 * Acepta valores negativos para retroceder.
 */
export function addMonthsUtc(reference: Date, months: number): Date {
  if (Number.isNaN(reference.getTime())) {
    throw new RangeError('La fecha de referencia no es válida.');
  }
  if (!Number.isInteger(months)) {
    throw new RangeError('La cantidad de meses debe ser un entero.');
  }

  const absoluteMonthIndex = reference.getUTCMonth() + months;
  const targetYear = reference.getUTCFullYear() + Math.floor(absoluteMonthIndex / 12);
  const targetMonth = ((absoluteMonthIndex % 12) + 12) % 12;
  const targetDay = Math.min(reference.getUTCDate(), lastDayOfUtcMonth(targetYear, targetMonth));

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      targetDay,
      reference.getUTCHours(),
      reference.getUTCMinutes(),
      reference.getUTCSeconds(),
      reference.getUTCMilliseconds(),
    ),
  );
}

/**
 * Fin del período de una suscripción mensual: `startedAt` + `months`, garantizando siempre un
 * instante estrictamente posterior al inicio (requisito de `ck_merchant_subscriptions_period`).
 */
export function computePeriodEnd(startedAt: Date, months = 1): Date {
  const periodEnd = addMonthsUtc(startedAt, months);
  if (periodEnd.getTime() <= startedAt.getTime()) {
    throw new RangeError('El fin de período debe ser posterior al inicio de la suscripción.');
  }
  return periodEnd;
}
