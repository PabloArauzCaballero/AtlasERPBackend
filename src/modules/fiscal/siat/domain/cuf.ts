/**
 * Código Único de Factura (CUF), con el algoritmo publicado por el SIN (siatinfo «Generación
 * CUF» y «Algoritmo Módulo 11»).
 *
 * La longitud del CUF depende del NIT (56 caracteres con un NIT de 9 dígitos, 57 con 10): nunca se
 * comprueba por longitud, se recalcula. Los tres vectores oficiales están en
 * `test/fiscal-siat-domain.spec.ts`.
 */

export interface CufInput {
  nit: string | number;
  /** `yyyy-MM-ddTHH:mm:ss.SSS`, hora local del emisor, sin zona. */
  fechaEmision: string;
  codigoSucursal: number;
  codigoModalidad: number;
  /** 1 en línea, 2 fuera de línea, 3 masiva. */
  codigoEmision: number;
  tipoFacturaDocumento: number;
  codigoDocumentoSector: number;
  numeroFactura: number | string;
  codigoPuntoVenta: number;
  /** `codigoControl` del CUFD con el que se emite. */
  codigoControl: string;
}

export class CufInputError extends Error {
  constructor(campo: string) {
    super(`No se puede calcular el CUF: el campo ${campo} no tiene la forma que exige el SIN.`);
    this.name = 'CufInputError';
  }
}

/** Módulo 11 del SIN: pesos 2..9 cíclicos desde la derecha; 10 → '1', 11 → '0'. */
export function modulo11(cadena: string): string {
  let suma = 0;
  let mult = 2;
  for (let i = cadena.length - 1; i >= 0; i -= 1) {
    suma += mult * Number(cadena[i]);
    mult = mult === 9 ? 2 : mult + 1;
  }
  const digito = suma % 11;
  if (digito === 10) return '1';
  if (digito === 11) return '0';
  return String(digito);
}

const FECHA = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/;

function fechaParaCuf(fechaEmision: string): string {
  const match = FECHA.exec(fechaEmision);
  if (!match) throw new CufInputError('fechaEmision');
  return match.slice(1).join('');
}

function relleno(campo: string, valor: string | number, ancho: number): string {
  const texto = String(valor).trim();
  if (!/^\d+$/.test(texto) || texto.length > ancho) throw new CufInputError(campo);
  return texto.padStart(ancho, '0');
}

export function calcularCuf(input: CufInput): string {
  if (!/^[0-9A-F]+$/i.test(input.codigoControl)) throw new CufInputError('codigoControl');
  const cadena = [
    relleno('nit', input.nit, 13),
    fechaParaCuf(input.fechaEmision),
    relleno('codigoSucursal', input.codigoSucursal, 4),
    relleno('codigoModalidad', input.codigoModalidad, 1),
    relleno('codigoEmision', input.codigoEmision, 1),
    relleno('tipoFacturaDocumento', input.tipoFacturaDocumento, 1),
    relleno('codigoDocumentoSector', input.codigoDocumentoSector, 2),
    relleno('numeroFactura', input.numeroFactura, 10),
    relleno('codigoPuntoVenta', input.codigoPuntoVenta, 4),
  ].join('');
  return (
    BigInt(cadena + modulo11(cadena))
      .toString(16)
      .toUpperCase() + input.codigoControl
  );
}
