/**
 * XML de la factura de compra-venta (sector 1), en el orden EXACTO del XSD del SIN
 * (`facturaComputarizadaCompraVenta.xsd`, versión 23/08/2021).
 *
 * Todos los elementos van siempre: un opcional sin valor se escribe `xsi:nil="true"`, nunca se
 * omite (el XSD es una secuencia y el SIN responde 939 si falta uno). La modalidad electrónica (1)
 * cambia la raíz y añade la firma; el ERP emite la computarizada (2) y la electrónica queda
 * rechazada aquí hasta que exista el certificado (D-1 del plan).
 */

export const MAX_DETALLES_FACTURA = 500;

export interface CabeceraFactura {
  nitEmisor: string;
  razonSocialEmisor: string;
  municipio: string;
  telefono: string | null;
  numeroFactura: number;
  cuf: string;
  cufd: string;
  codigoSucursal: number;
  direccion: string;
  codigoPuntoVenta: number | null;
  fechaEmision: string;
  nombreRazonSocial: string | null;
  codigoTipoDocumentoIdentidad: number;
  numeroDocumento: string;
  complemento: string | null;
  codigoCliente: string;
  codigoMetodoPago: number;
  numeroTarjeta: string | null;
  montoTotal: string;
  montoTotalSujetoIva: string;
  codigoMoneda: number;
  tipoCambio: string;
  montoTotalMoneda: string;
  montoGiftCard: string | null;
  descuentoAdicional: string | null;
  codigoExcepcion: number | null;
  cafc: string | null;
  leyenda: string;
  usuario: string;
  codigoDocumentoSector: number;
}

export interface DetalleFactura {
  actividadEconomica: string;
  codigoProductoSin: number;
  codigoProducto: string;
  descripcion: string;
  cantidad: string;
  unidadMedida: number;
  precioUnitario: string;
  montoDescuento: string | null;
  subTotal: string;
  numeroSerie: string | null;
  numeroImei: string | null;
}

const ORDEN_CABECERA: readonly (keyof CabeceraFactura)[] = [
  'nitEmisor',
  'razonSocialEmisor',
  'municipio',
  'telefono',
  'numeroFactura',
  'cuf',
  'cufd',
  'codigoSucursal',
  'direccion',
  'codigoPuntoVenta',
  'fechaEmision',
  'nombreRazonSocial',
  'codigoTipoDocumentoIdentidad',
  'numeroDocumento',
  'complemento',
  'codigoCliente',
  'codigoMetodoPago',
  'numeroTarjeta',
  'montoTotal',
  'montoTotalSujetoIva',
  'codigoMoneda',
  'tipoCambio',
  'montoTotalMoneda',
  'montoGiftCard',
  'descuentoAdicional',
  'codigoExcepcion',
  'cafc',
  'leyenda',
  'usuario',
  'codigoDocumentoSector',
];

const ORDEN_DETALLE: readonly (keyof DetalleFactura)[] = [
  'actividadEconomica',
  'codigoProductoSin',
  'codigoProducto',
  'descripcion',
  'cantidad',
  'unidadMedida',
  'precioUnitario',
  'montoDescuento',
  'subTotal',
  'numeroSerie',
  'numeroImei',
];

/** Longitudes máximas del XSD: un texto más largo es 939, mejor fallar antes de enviar. */
const LONGITUD_MAXIMA: Readonly<Record<string, number>> = {
  razonSocialEmisor: 200,
  municipio: 25,
  telefono: 25,
  cuf: 100,
  cufd: 100,
  direccion: 500,
  nombreRazonSocial: 500,
  numeroDocumento: 20,
  complemento: 5,
  codigoCliente: 100,
  leyenda: 200,
  usuario: 100,
  codigoProducto: 50,
  descripcion: 500,
};

export class FacturaXmlError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FacturaXmlError';
  }
}

export function escaparXml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function elemento(nombre: string, valor: string | number | null, sangria: string): string {
  if (valor === null || valor === undefined || valor === '') {
    return `${sangria}<${nombre} xsi:nil="true"/>`;
  }
  const texto = String(valor);
  const maximo = LONGITUD_MAXIMA[nombre];
  if (maximo !== undefined && texto.length > maximo) {
    throw new FacturaXmlError(
      'FISCAL_FIELD_TOO_LONG',
      `El campo ${nombre} tiene ${texto.length} caracteres y el SIN admite ${maximo}.`,
    );
  }
  return `${sangria}<${nombre}>${escaparXml(texto)}</${nombre}>`;
}

export function construirFacturaXml(
  codigoModalidad: number,
  cabecera: CabeceraFactura,
  detalle: readonly DetalleFactura[],
): string {
  if (codigoModalidad !== 2) {
    throw new FacturaXmlError(
      'FISCAL_MODALITY_NOT_SUPPORTED',
      'Sólo está implementada la modalidad computarizada en línea (2); la electrónica necesita firma digital.',
    );
  }
  if (detalle.length === 0 || detalle.length > MAX_DETALLES_FACTURA) {
    throw new FacturaXmlError(
      'FISCAL_DETAIL_COUNT_OUT_OF_RANGE',
      `Una factura lleva entre 1 y ${MAX_DETALLES_FACTURA} líneas; esta tiene ${detalle.length}.`,
    );
  }
  if (cabecera.complemento && cabecera.codigoTipoDocumentoIdentidad !== 1) {
    throw new FacturaXmlError(
      'FISCAL_COMPLEMENT_ONLY_FOR_CI',
      'El complemento sólo se admite con cédula de identidad.',
    );
  }
  const raiz = 'facturaComputarizadaCompraVenta';
  const lineas = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<${raiz} xsi:noNamespaceSchemaLocation="${raiz}.xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`,
    '  <cabecera>',
    ...ORDEN_CABECERA.map((campo) => elemento(campo, cabecera[campo], '    ')),
    '  </cabecera>',
    ...detalle.flatMap((linea) => [
      '  <detalle>',
      ...ORDEN_DETALLE.map((campo) => elemento(campo, linea[campo], '    ')),
      '  </detalle>',
    ]),
    `</${raiz}>`,
  ];
  return lineas.join('\n');
}
