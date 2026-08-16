/**
 * Cómo se le paga a un proveedor: el vocabulario, en un solo sitio.
 *
 * **Por qué un catálogo y no texto libre.** «Cómo se paga» vivía como una nota
 * escrita a mano por quien dio de alta al proveedor. Con eso no se puede hacer
 * ninguna de las tres cosas para las que existe el dato: no se puede calcular
 * una fecha de vencimiento, no se puede agrupar la cartera por modalidad para
 * saber cuánto vence este mes, y no se puede validar nada — «30 días fdm», «a
 * 30 dias fin de mes» y «neto 30» son la misma condición escrita de tres formas
 * y ningún informe las junta.
 *
 * **Por qué el vocabulario está aquí y no en un `enum` de TypeScript.** Cada
 * término lleva su explicación y su efecto sobre el cálculo de la fecha. Un
 * `enum` sólo lleva la letra, así que la explicación acaba duplicada en la
 * pantalla y el efecto disperso en `if`s por el servicio — que es exactamente
 * el patrón que este archivo existe para impedir.
 */

/** Cuándo nace la obligación de pagar. */
export const MODALIDADES_DE_PAGO = {
  CONTADO: {
    code: 'CONTADO',
    label: 'Contado',
    help: 'Se paga al recibir la factura. El vencimiento es la propia fecha de factura.',
    /** Días que se suman a la base para obtener el vencimiento. `null` = lo fija el plazo. */
    diasFijos: 0,
  },
  CREDITO: {
    code: 'CREDITO',
    label: 'Crédito',
    help: 'Se paga a un plazo acordado desde la base de cómputo.',
    diasFijos: null,
  },
  ANTICIPO: {
    code: 'ANTICIPO',
    label: 'Anticipo',
    help: 'Se adelanta un porcentaje antes de recibir el bien o servicio.',
    diasFijos: 0,
  },
  CONTRA_ENTREGA: {
    code: 'CONTRA_ENTREGA',
    label: 'Contra entrega',
    help: 'Se paga al recibir conforme. La base de cómputo es la recepción, no la factura.',
    diasFijos: 0,
  },
  PARCIAL: {
    code: 'PARCIAL',
    label: 'Pago parcial',
    help: 'Se liquida en varios pagos dentro del plazo acordado.',
    diasFijos: null,
  },
  HITOS: {
    code: 'HITOS',
    label: 'Por hitos',
    help: 'Cada pago se libera al cumplirse un hito del contrato, no por calendario.',
    diasFijos: null,
  },
  RECURRENTE: {
    code: 'RECURRENTE',
    label: 'Recurrente',
    help: 'Importe periódico mientras el contrato siga vigente.',
    diasFijos: null,
  },
} as const;

export type ModalidadDePago = keyof typeof MODALIDADES_DE_PAGO;

/**
 * Desde qué fecha se cuentan los días del plazo.
 *
 * No es un detalle: «30 días desde factura» y «30 días desde recepción» pueden
 * separarse semanas, y es la discrepancia que más disputas de pago produce.
 */
export const BASES_DE_COMPUTO = {
  FECHA_FACTURA: {
    code: 'FECHA_FACTURA',
    label: 'Fecha de factura',
    help: 'El plazo corre desde la fecha que la factura declara.',
  },
  FECHA_RECEPCION: {
    code: 'FECHA_RECEPCION',
    label: 'Fecha de recepción',
    help: 'El plazo corre desde que se recibe conforme el bien o servicio.',
  },
  FIN_DE_MES: {
    code: 'FIN_DE_MES',
    label: 'Fin de mes de factura',
    help: 'El plazo corre desde el último día del mes de la factura.',
  },
} as const;

export type BaseDeComputo = keyof typeof BASES_DE_COMPUTO;

/** Con qué instrumento se paga. Decide qué datos bancarios hacen falta. */
export const MEDIOS_DE_PAGO = {
  TRANSFERENCIA: {
    code: 'TRANSFERENCIA',
    label: 'Transferencia bancaria',
    /** Sin cuenta del proveedor no se puede emitir: es un dato obligatorio, no un adorno. */
    exigeCuenta: true,
  },
  CHEQUE: { code: 'CHEQUE', label: 'Cheque', exigeCuenta: false },
  EFECTIVO: { code: 'EFECTIVO', label: 'Efectivo', exigeCuenta: false },
  TARJETA: { code: 'TARJETA', label: 'Tarjeta', exigeCuenta: false },
  QR: { code: 'QR', label: 'Pago con QR', exigeCuenta: true },
  COMPENSACION: {
    code: 'COMPENSACION',
    label: 'Compensación de saldos',
    exigeCuenta: false,
  },
} as const;

export type MedioDePago = keyof typeof MEDIOS_DE_PAGO;

/** Cada cuánto se repite, cuando la modalidad es recurrente. */
export const FRECUENCIAS = {
  UNICA: { code: 'UNICA', label: 'Pago único', meses: null },
  SEMANAL: { code: 'SEMANAL', label: 'Semanal', meses: null },
  QUINCENAL: { code: 'QUINCENAL', label: 'Quincenal', meses: null },
  MENSUAL: { code: 'MENSUAL', label: 'Mensual', meses: 1 },
  BIMESTRAL: { code: 'BIMESTRAL', label: 'Bimestral', meses: 2 },
  TRIMESTRAL: { code: 'TRIMESTRAL', label: 'Trimestral', meses: 3 },
  SEMESTRAL: { code: 'SEMESTRAL', label: 'Semestral', meses: 6 },
  ANUAL: { code: 'ANUAL', label: 'Anual', meses: 12 },
} as const;

export type Frecuencia = keyof typeof FRECUENCIAS;

/** Ciclo de vida de una condición de pago. */
export const ESTADOS_CONDICION = {
  BORRADOR: { code: 'BORRADOR', label: 'Borrador', aplicable: false },
  ACTIVA: { code: 'ACTIVA', label: 'Activa', aplicable: true },
  SUSPENDIDA: { code: 'SUSPENDIDA', label: 'Suspendida', aplicable: false },
  VENCIDA: { code: 'VENCIDA', label: 'Vencida', aplicable: false },
  ARCHIVADA: { code: 'ARCHIVADA', label: 'Archivada', aplicable: false },
} as const;

export type EstadoCondicion = keyof typeof ESTADOS_CONDICION;

/**
 * El catálogo completo, para que la interfaz pinte selects sin copiar listas.
 *
 * Se sirve por HTTP y no se replica en el frontend por la misma razón de
 * siempre: una copia se separa el día que se añade una modalidad, y quien la
 * necesite no podrá elegirla sin que nada delate por qué falta.
 */
export function buildPaymentTermsCatalog() {
  const listar = <T extends Record<string, { code: string; label: string }>>(fuente: T) =>
    Object.values(fuente);
  return {
    modalidades: listar(MODALIDADES_DE_PAGO),
    basesDeComputo: listar(BASES_DE_COMPUTO),
    mediosDePago: listar(MEDIOS_DE_PAGO),
    frecuencias: listar(FRECUENCIAS),
    estados: listar(ESTADOS_CONDICION),
  };
}
