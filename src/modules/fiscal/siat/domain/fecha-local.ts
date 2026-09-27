/**
 * Fechas en la hora local del emisor, con el formato que exige el SIN
 * (`yyyy-MM-ddTHH:mm:ss.SSS`, sin zona).
 *
 * La zona sale de `legal_entity.timezone` (por defecto `America/La_Paz`), nunca del reloj del
 * servidor: el contenedor corre en UTC y una factura emitida a las 21:00 de La Paz caería en el
 * día siguiente, en otro período contable y con 1009 en el SIN.
 */

const partesCache = new Map<string, Intl.DateTimeFormat>();

function formateador(zona: string): Intl.DateTimeFormat {
  let formato = partesCache.get(zona);
  if (!formato) {
    formato = new Intl.DateTimeFormat('en-CA', {
      timeZone: zona,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    partesCache.set(zona, formato);
  }
  return formato;
}

/** `2026-09-26T16:03:48.675` en la zona indicada. */
export function fechaHoraLocal(instante: Date, zona: string): string {
  const partes = Object.fromEntries(
    formateador(zona)
      .formatToParts(instante)
      .map((parte) => [parte.type, parte.value]),
  );
  const ms = String(instante.getUTCMilliseconds()).padStart(3, '0');
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}:${partes.second}.${ms}`;
}

/** La fecha (`yyyy-MM-dd`) de una `fechaHoraLocal`: la que decide el período contable. */
export function fechaDe(fechaHora: string): string {
  return fechaHora.slice(0, 10);
}
