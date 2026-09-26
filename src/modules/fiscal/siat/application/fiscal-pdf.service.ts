import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { gunzipSync } from 'node:zlib';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { env } from '../../../../config/env';
import { qrSvgDataUri } from '../../../../common/qr/qr';
import { fromMinorUnits, toMinorUnits } from '../../../../common/money/decimal-amount.util';
import {
  ElectronicTaxDocumentModel,
  SiatCatalogItemModel,
  SiatIssuerProfileModel,
  SiatSignificantEventModel,
} from '../../../../database/models';
import { DocumentsService, GeneratedPdf } from '../../../documents/documents.service';
import { montoLiteral } from '../domain/monto-literal';

/** URL de consulta del QR en el piloto; la de producción la comunica el SIN (SIAT_QR_BASE_URL). */
const QR_PILOTO = 'https://pilotosiat.impuestos.gob.bo/consulta/QR';

const TIPOS_DOCUMENTO: Readonly<Record<string, string>> = {
  '1': 'CI - CÉDULA DE IDENTIDAD',
  '2': 'CEX - CÉDULA DE IDENTIDAD DE EXTRANJERO',
  '3': 'PAS - PASAPORTE',
  '4': 'OD - OTRO DOCUMENTO DE IDENTIDAD',
  '5': 'NIT - NÚMERO DE IDENTIFICACIÓN TRIBUTARIA',
};

/** Campos hoja de un bloque del XML que el propio ERP generó (orden y forma conocidos). */
function campos(bloque: string): Record<string, string | null> {
  const salida: Record<string, string | null> = {};
  for (const [, nombre, valor] of bloque.matchAll(/<(\w+)(?: xsi:nil="true"\/>|>([^<]*)<\/\1>)/g)) {
    salida[nombre!] =
      valor === undefined
        ? null
        : valor
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&amp;/g, '&');
  }
  return salida;
}

const monto = (valor: string | null | undefined) => fromMinorUnits(toMinorUnits(valor ?? '0'), 2);

/**
 * Representación gráfica de la factura (plantilla `factura-fiscal` del worker de PDF), armada
 * SÓLO desde el XML que se envió al SIN: lo impreso es exactamente lo declarado. Sin documento
 * validado u OFFLINE, sale marcada «REPRESENTACIÓN INTERNA — no es factura fiscal».
 */
@Injectable()
export class FiscalPdfService {
  constructor(
    private readonly documents: DocumentsService,
    @InjectModel(SiatIssuerProfileModel)
    private readonly profileModel: typeof SiatIssuerProfileModel,
    @InjectModel(SiatSignificantEventModel)
    private readonly eventModel: typeof SiatSignificantEventModel,
    @InjectModel(SiatCatalogItemModel) private readonly catalogModel: typeof SiatCatalogItemModel,
    private readonly sequelize: Sequelize,
  ) {}

  async payload(documento: ElectronicTaxDocumentModel): Promise<Record<string, unknown>> {
    if (!documento.xmlGzip || !documento.issuerProfileId) {
      throw new NotFoundException({
        code: 'FISCAL_DOCUMENT_WITHOUT_XML',
        message: 'Este documento fiscal no tiene XML (registro anterior a la integración).',
      });
    }
    const xml = gunzipSync(documento.xmlGzip).toString('utf8');
    const cabecera = campos(/<cabecera>([\s\S]*?)<\/cabecera>/.exec(xml)?.[1] ?? '');
    const detalle = [...xml.matchAll(/<detalle>([\s\S]*?)<\/detalle>/g)].map((m) => campos(m[1]!));

    const estado = ['ACCEPTED', 'OBSERVED'].includes(documento.siatStatus)
      ? 'VALIDA'
      : ['OFFLINE', 'PACKAGED'].includes(documento.siatStatus)
        ? 'FUERA_DE_LINEA'
        : 'REPRESENTACION_INTERNA';
    const evento =
      estado === 'FUERA_DE_LINEA' && documento.eventId
        ? await this.eventModel.findByPk(documento.eventId)
        : null;

    const unidades = new Map(
      (await this.catalogModel.findAll({ where: { catalogCode: 'UNIDAD_MEDIDA' } })).map((i) => [
        i.codigo,
        i.descripcion,
      ]),
    );
    const qrBase = env.SIAT_QR_BASE_URL ?? QR_PILOTO;
    const qr = `${qrBase}?nit=${cabecera.nitEmisor}&cuf=${documento.cuf}&numero=${cabecera.numeroFactura}&t=2`;
    const subtotal = detalle.reduce(
      (suma, linea) => suma + toMinorUnits(linea.subTotal ?? '0'),
      0n,
    );

    return {
      emisor: {
        nit: cabecera.nitEmisor,
        razonSocial: cabecera.razonSocialEmisor,
        municipio: cabecera.municipio,
        direccion: cabecera.direccion,
        ...(cabecera.telefono ? { telefono: cabecera.telefono } : {}),
        sucursal: Number(cabecera.codigoSucursal ?? 0),
        puntoVenta: Number(cabecera.codigoPuntoVenta ?? 0),
      },
      numeroFactura: Number(cabecera.numeroFactura),
      cuf: documento.cuf,
      fechaEmision: formatearFecha(cabecera.fechaEmision ?? ''),
      referenciaInterna: (await this.referenciaInterna(documento)) ?? String(documento.sourceId),
      receptor: {
        nombreRazonSocial: cabecera.nombreRazonSocial ?? 'S/N',
        tipoDocumento: TIPOS_DOCUMENTO[cabecera.codigoTipoDocumentoIdentidad ?? ''] ?? 'OTRO',
        numeroDocumento: cabecera.numeroDocumento,
        ...(cabecera.complemento ? { complemento: cabecera.complemento } : {}),
        codigoCliente: cabecera.codigoCliente,
      },
      detalle: detalle.map((linea) => ({
        codigoProducto: linea.codigoProducto,
        descripcion: linea.descripcion,
        cantidad: linea.cantidad,
        unidadMedida: unidades.get(linea.unidadMedida ?? '') ?? `UNIDAD ${linea.unidadMedida}`,
        precioUnitario: linea.precioUnitario,
        descuento: monto(linea.montoDescuento),
        subTotal: monto(linea.subTotal),
      })),
      totales: {
        subtotal: fromMinorUnits(subtotal, 2),
        descuentoAdicional: monto(cabecera.descuentoAdicional),
        montoTotal: monto(cabecera.montoTotal),
        montoAPagar: monto(cabecera.montoTotal),
        importeBaseCreditoFiscal: monto(cabecera.montoTotalSujetoIva),
        montoLiteral: montoLiteral(monto(cabecera.montoTotal)),
      },
      moneda: 'Bolivianos',
      leyenda: cabecera.leyenda,
      qrDataUri: qrSvgDataUri(qr),
      estado,
      ...(estado === 'FUERA_DE_LINEA'
        ? {
            eventoContingencia: Number(
              // El número que da el SIN al registrar el evento; antes de eso, el código del motivo.
              evento?.codigoRecepcionEvento ?? evento?.codigoEvento ?? 1,
            ),
          }
        : {}),
    };
  }

  async pdf(documento: ElectronicTaxDocumentModel): Promise<GeneratedPdf> {
    return this.documents.generateInternal(
      'factura-fiscal',
      await this.payload(documento),
      `factura-${documento.numeroFactura ?? documento.id}.pdf`,
    );
  }

  private async referenciaInterna(documento: ElectronicTaxDocumentModel): Promise<string | null> {
    const sql =
      documento.sourceType === 'MERCHANT_INVOICE'
        ? 'SELECT invoice_number AS ref FROM atlas_sales.merchant_invoices WHERE id = $1'
        : documento.sourceType === 'AR_INVOICE'
          ? 'SELECT invoice_no AS ref FROM atlas_accounting.ar_invoice WHERE id = $1'
          : null;
    if (!sql) return null;
    const [fila] = await this.sequelize.query<{ ref: string }>(sql, {
      bind: [documento.sourceId],
      type: QueryTypes.SELECT,
    });
    return fila?.ref ?? null;
  }
}

/** `2026-09-26T16:03:48.675` → `26/09/2026 16:03`. */
function formatearFecha(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(fecha);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : fecha;
}
