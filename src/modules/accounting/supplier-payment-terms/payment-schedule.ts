import {
  BASES_DE_COMPUTO,
  MEDIOS_DE_PAGO,
  MODALIDADES_DE_PAGO,
  type BaseDeComputo,
  type MedioDePago,
  type ModalidadDePago,
} from './payment-terms.catalog';

/**
 * Cuándo hay que pagarle a un proveedor, y cuánto de eso es anticipo.
 *
 * **Por qué esto existe.** Mientras «cómo se paga» era una nota escrita a mano,
 * la fecha de vencimiento la calculaba una persona leyendo esa nota. Eso tiene
 * dos consecuencias medibles: nadie puede responder «¿cuánto vence esta
 * semana?» sin abrir las facturas una a una, y las discrepancias sobre la fecha
 * —que casi siempre son sobre la BASE de cómputo, no sobre el plazo— sólo
 * aparecen cuando el proveedor reclama.
 *
 * Con la condición estructurada, la fecha se deriva y se puede discutir sobre el
 * dato en vez de sobre la interpretación de una frase.
 */

export interface CondicionDePago {
  modalidad: ModalidadDePago;
  baseDeComputo: BaseDeComputo;
  /** Días de plazo. Se ignora cuando la modalidad fija sus propios días. */
  plazoDias: number;
  medioDePago: MedioDePago;
  /** Tanto por ciento que se adelanta. Sólo tiene sentido con anticipo. */
  porcentajeAnticipo?: number;
  /** Cuenta bancaria del proveedor, si la hay registrada. */
  cuentaBancariaId?: string | null;
}

export interface FechasDelPago {
  /** Desde dónde se contaron los días. Se devuelve para poder explicar el resultado. */
  base: string;
  vencimiento: string;
  /** Importe que se adelanta, en la moneda de la factura. `0` si no hay anticipo. */
  montoAnticipo: number;
  /** Lo que queda por pagar al vencimiento. */
  montoDiferido: number;
}

/** Los problemas que impiden emitir el pago, con su motivo. */
export interface ProblemaDeCondicion {
  code: string;
  message: string;
}

/**
 * Revisa que la condición se pueda ejecutar, ANTES de guardarla.
 *
 * Validar al guardar y no al pagar es la diferencia entre corregir un dato
 * mientras se tiene delante al proveedor y descubrir en la corrida de pagos del
 * viernes que veinte facturas no se pueden emitir.
 */
export function revisarCondicion(condicion: CondicionDePago): ProblemaDeCondicion[] {
  const problemas: ProblemaDeCondicion[] = [];

  if (MODALIDADES_DE_PAGO[condicion.modalidad].diasFijos === null && condicion.plazoDias <= 0) {
    problemas.push({
      code: 'PLAZO_REQUERIDO',
      message: `La modalidad «${MODALIDADES_DE_PAGO[condicion.modalidad].label}» necesita un plazo en días mayor que cero.`,
    });
  }

  if (condicion.plazoDias < 0) {
    problemas.push({ code: 'PLAZO_NEGATIVO', message: 'El plazo no puede ser negativo.' });
  }

  const anticipo = condicion.porcentajeAnticipo ?? 0;
  if (anticipo < 0 || anticipo > 100) {
    problemas.push({
      code: 'ANTICIPO_FUERA_DE_RANGO',
      message: 'El porcentaje de anticipo debe estar entre 0 y 100.',
    });
  }
  if (condicion.modalidad !== 'ANTICIPO' && anticipo > 0) {
    // No se rechaza en silencio ni se aplica a escondidas: se dice, porque un
    // anticipo que nadie declaró es dinero que sale antes de tiempo.
    problemas.push({
      code: 'ANTICIPO_SIN_MODALIDAD',
      message: 'Hay un porcentaje de anticipo pero la modalidad no es «Anticipo».',
    });
  }
  if (condicion.modalidad === 'ANTICIPO' && anticipo === 0) {
    problemas.push({
      code: 'ANTICIPO_SIN_PORCENTAJE',
      message: 'La modalidad «Anticipo» necesita un porcentaje mayor que cero.',
    });
  }

  if (MEDIOS_DE_PAGO[condicion.medioDePago].exigeCuenta && !condicion.cuentaBancariaId) {
    problemas.push({
      code: 'CUENTA_REQUERIDA',
      message: `El medio «${MEDIOS_DE_PAGO[condicion.medioDePago].label}» exige una cuenta bancaria del proveedor.`,
    });
  }

  return problemas;
}

function soloFecha(valor: Date): string {
  return valor.toISOString().slice(0, 10);
}

/** El último día del mes de una fecha, sin depender de la zona horaria local. */
function finDeMes(fecha: Date): Date {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, 0));
}

/**
 * Calcula base, vencimiento y reparto entre anticipo y diferido.
 *
 * Las fechas se manejan en UTC a propósito. Con fechas locales, un vencimiento
 * calculado a las 23:00 en un huso al oeste cae un día antes al serializarse, y
 * un día de diferencia en un vencimiento es una mora.
 */
export function calcularFechasDePago(
  condicion: CondicionDePago,
  entrada: { fechaFactura: string; fechaRecepcion?: string | null; importe: number },
): FechasDelPago {
  const factura = new Date(`${entrada.fechaFactura}T00:00:00.000Z`);
  const recepcion = entrada.fechaRecepcion
    ? new Date(`${entrada.fechaRecepcion}T00:00:00.000Z`)
    : null;

  /*
   * `FECHA_RECEPCION` sin recepción registrada cae a la factura, y eso NO es un
   * apaño: es lo conservador. Contar desde una recepción que no consta sería
   * inventar una fecha; contar desde la factura da un vencimiento igual o
   * ANTERIOR al real, así que como mucho se paga antes de tiempo — nunca tarde.
   */
  const base =
    condicion.baseDeComputo === BASES_DE_COMPUTO.FECHA_RECEPCION.code
      ? (recepcion ?? factura)
      : condicion.baseDeComputo === BASES_DE_COMPUTO.FIN_DE_MES.code
        ? finDeMes(factura)
        : factura;

  const diasFijos = MODALIDADES_DE_PAGO[condicion.modalidad].diasFijos;
  const dias = diasFijos ?? condicion.plazoDias;
  const vencimiento = new Date(base.getTime());
  vencimiento.setUTCDate(vencimiento.getUTCDate() + dias);

  const porcentaje = condicion.modalidad === 'ANTICIPO' ? (condicion.porcentajeAnticipo ?? 0) : 0;
  // Se redondea a céntimos y el diferido sale por RESTA, no por su propio
  // porcentaje: calculando los dos por separado, la suma se separa del total en
  // un céntimo y la factura queda descuadrada.
  const montoAnticipo = Math.round(entrada.importe * porcentaje) / 100;

  return {
    base: soloFecha(base),
    vencimiento: soloFecha(vencimiento),
    montoAnticipo,
    montoDiferido: Math.round((entrada.importe - montoAnticipo) * 100) / 100,
  };
}
