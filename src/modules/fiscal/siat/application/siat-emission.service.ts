import {
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { toMinorUnits } from '../../../../common/money/decimal-amount.util';
import {
  ElectronicTaxDocumentModel,
  LegalEntityModel,
  SiatCufdModel,
  SiatCuisModel,
  SiatIssuerProfileModel,
  SiatSignificantEventModel,
} from '../../../../database/models';
import { calcularCuf } from '../domain/cuf';
import { construirFacturaXml, DetalleFactura } from '../domain/factura-xml';
import { fechaDe, fechaHoraLocal } from '../domain/fecha-local';
import { calcularTotales, MontosFiscalesError } from '../domain/montos';
import { comprimir } from '../domain/paquete-tar';
import { OPERACIONES, SiatTransportError } from '../infrastructure/siat-transport';
import { SiatContingencyService } from './siat-contingency.service';
import { SiatCredentialsService } from './siat-credentials.service';
import { SiatGatewayService } from './siat-gateway.service';

export type FuenteFiscal = 'AR_INVOICE' | 'MERCHANT_INVOICE' | 'AD_INVOICE';

/** 5 = NIT en el catálogo del SIN. */
export const TIPO_DOCUMENTO_NIT = 5;
/** En contingencia vale el último CUFD obtenido hasta 72 h (página «Ingreso a Contingencia»). */
const CUFD_CONTINGENCIA_MS = 72 * 60 * 60 * 1000;

export interface ReceptorFiscal {
  codigoTipoDocumentoIdentidad: number;
  numeroDocumento: string;
  complemento?: string | null;
  nombreRazonSocial: string;
  codigoCliente: string;
  correo?: string | null;
}

export interface LineaAEmitir {
  codigoProducto: string;
  descripcion: string;
  cantidad: string;
  /** CON IVA: la factura fiscal no desglosa el impuesto. */
  precioUnitario: string;
  montoDescuento?: string;
  codigoProductoSin: number;
  unidadMedida: number;
  actividadEconomica?: string | null;
}

export interface DocumentoAEmitir {
  sourceType: FuenteFiscal;
  sourceId: string;
  receptor: ReceptorFiscal;
  lineas: LineaAEmitir[];
  /** Total CON IVA de la factura del ERP: el del XML tiene que coincidir al céntimo. */
  totalEsperado: string;
  codigoMetodoPago?: number;
  leyenda?: string | null;
}

/** Lo que se decide ANTES de abrir la transacción de la factura (llamadas de red incluidas). */
export interface EmisionPreparada {
  perfil: SiatIssuerProfileModel;
  zona: string;
  cuis: SiatCuisModel;
  cufd: SiatCufdModel;
  codigoEmision: 1 | 2;
  evento: SiatSignificantEventModel | null;
  nitValido: boolean | null;
}

function fiscalError(code: string, message: string, extra: Record<string, unknown> = {}) {
  return new UnprocessableEntityException({ code, message, ...extra });
}

/**
 * Emisión del documento fiscal, en dos tiempos:
 *
 * 1. `preparar` — FUERA de la transacción de la factura: perfil emisor, comunicación con el SIN,
 *    CUIS/CUFD vigentes y si se emite en línea (1) o fuera de línea (2). Se decide ANTES de
 *    calcular el CUF porque el tipo de emisión entra en él.
 * 2. `emitirEnTransaccion` — DENTRO de la transacción de la factura: número fiscal, montos,
 *    CUF, XML, gzip y hash, y la fila `electronic_tax_document` en `QUEUED` (en línea; el
 *    procesador la envía) u `OFFLINE` (vale ya como factura bajo el evento de contingencia).
 *
 * Con `SIAT_MODE=disabled` `preparar` devuelve `null` y no se crea documento fiscal.
 */
@Injectable()
export class SiatEmissionService {
  constructor(
    private readonly gateway: SiatGatewayService,
    private readonly credentials: SiatCredentialsService,
    private readonly contingency: SiatContingencyService,
    @InjectModel(SiatIssuerProfileModel)
    private readonly profileModel: typeof SiatIssuerProfileModel,
    @InjectModel(SiatCuisModel) private readonly cuisModel: typeof SiatCuisModel,
    @InjectModel(SiatCufdModel) private readonly cufdModel: typeof SiatCufdModel,
    @InjectModel(LegalEntityModel) private readonly legalEntityModel: typeof LegalEntityModel,
    @InjectModel(ElectronicTaxDocumentModel)
    private readonly documentModel: typeof ElectronicTaxDocumentModel,
    private readonly sequelize: Sequelize,
  ) {}

  get activo(): boolean {
    return this.gateway.activo;
  }

  /** El emisor: el de la entidad pedida o, si no se pide, el único activo de la instalación. */
  async perfilPara(legalEntityId?: string | null): Promise<SiatIssuerProfileModel> {
    const where = { status: 'ACTIVE', codigoSucursal: 0, codigoPuntoVenta: 0 };
    const perfiles = await this.profileModel.findAll({
      where: legalEntityId ? { ...where, legalEntityId } : where,
    });
    if (perfiles.length === 1) return perfiles[0]!;
    if (perfiles.length === 0) {
      throw fiscalError(
        'FISCAL_ISSUER_NOT_CONFIGURED',
        'La facturación electrónica está activa pero no hay un emisor configurado ante Impuestos Nacionales para esta entidad legal.',
      );
    }
    throw fiscalError(
      'FISCAL_ISSUER_AMBIGUOUS',
      'Hay más de un emisor activo: indica la entidad legal que factura.',
    );
  }

  async preparar(
    legalEntityId?: string | null,
    receptor?: Pick<ReceptorFiscal, 'codigoTipoDocumentoIdentidad' | 'numeroDocumento'>,
  ): Promise<EmisionPreparada | null> {
    if (!this.gateway.activo) return null;
    const perfil = await this.perfilPara(legalEntityId);
    const entidad = await this.legalEntityModel.findByPk(perfil.legalEntityId);
    const zona = entidad?.timezone ?? 'America/La_Paz';

    const eventoAbierto = await this.contingency.eventoAbierto(perfil.id);
    if (!eventoAbierto && (await this.credentials.verificarComunicacion())) {
      try {
        const cuis = await this.credentials.cuisVigente(perfil);
        const cufd = await this.credentials.cufdVigente(perfil);
        const nitValido =
          receptor?.codigoTipoDocumentoIdentidad === TIPO_DOCUMENTO_NIT
            ? await this.verificarNit(perfil, cuis.codigo, receptor.numeroDocumento)
            : null;
        return { perfil, zona, cuis, cufd, codigoEmision: 1, evento: null, nitValido };
      } catch (error) {
        // Un SIN que se cae entre la comprobación y el CUFD es exactamente una contingencia.
        if (!(error instanceof ServiceUnavailableException)) throw error;
      }
    }
    return this.prepararFueraDeLinea(perfil, zona, eventoAbierto);
  }

  private async prepararFueraDeLinea(
    perfil: SiatIssuerProfileModel,
    zona: string,
    eventoAbierto: SiatSignificantEventModel | null,
  ): Promise<EmisionPreparada> {
    // Con un evento abierto se emite con SU CUFD: todas las facturas del paquete lo comparten.
    const cufd = eventoAbierto
      ? await this.cufdModel.findByPk(eventoAbierto.cufdEventoId)
      : await this.cufdModel.findOne({
          where: {
            issuerProfileId: perfil.id,
            obtainedAt: { [Op.gt]: new Date(Date.now() - CUFD_CONTINGENCIA_MS) },
          },
          order: [['obtainedAt', 'DESC']],
        });
    const cuis = await this.cuisModel.findOne({
      where: { issuerProfileId: perfil.id, isActive: true },
      order: [['fechaVigencia', 'DESC']],
    });
    if (!cufd || !cuis) {
      throw new ServiceUnavailableException({
        code: 'FISCAL_UNAVAILABLE_NO_CUFD',
        message:
          'Impuestos Nacionales no responde y no hay un código diario (CUFD) válido de las últimas 72 horas: la factura no se puede emitir ahora. Inténtalo cuando vuelva la conexión.',
      });
    }
    const evento = eventoAbierto ?? (await this.contingency.abrir(perfil, cufd));
    return { perfil, zona, cuis, cufd, codigoEmision: 2, evento, nitValido: null };
  }

  private async verificarNit(
    perfil: SiatIssuerProfileModel,
    cuis: string,
    nit: string,
  ): Promise<boolean | null> {
    if (!/^\d{1,13}$/.test(nit)) return false;
    try {
      const { respuesta } = await this.gateway.llamar(perfil.id, OPERACIONES.verificarNit, {
        ...this.gateway.solicitudBase(perfil),
        cuis,
        nitParaVerificacion: Number(nit),
      });
      return (respuesta.mensajesList ?? []).some((m) => m.codigo === 986);
    } catch (error) {
      if (error instanceof SiatTransportError) return null;
      throw error;
    }
  }

  /** La fecha (Bolivia) que tendrá la factura: `invoiceDate` debe ser ésta con SIAT activo. */
  fechaDeEmisionHoy(preparada: EmisionPreparada): string {
    return fechaDe(fechaHoraLocal(new Date(), preparada.zona));
  }

  async emitirEnTransaccion(
    preparada: EmisionPreparada,
    documento: DocumentoAEmitir,
    transaction: Transaction,
  ): Promise<ElectronicTaxDocumentModel> {
    const { perfil, cufd, cuis, codigoEmision } = preparada;
    const { receptor } = documento;
    if (!/^\S{1,20}$/.test(receptor.numeroDocumento ?? '')) {
      throw fiscalError(
        'FISCAL_RECEIVER_INCOMPLETE',
        'El cliente no tiene NIT o documento de identidad: la factura fiscal lo exige.',
        { field: 'numeroDocumento' },
      );
    }
    if (!receptor.nombreRazonSocial?.trim()) {
      throw fiscalError('FISCAL_RECEIVER_INCOMPLETE', 'El cliente no tiene razón social.', {
        field: 'nombreRazonSocial',
      });
    }

    let totales;
    try {
      totales = calcularTotales(
        documento.lineas.map((l) => ({
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
          montoDescuento: l.montoDescuento ?? '0',
        })),
      );
    } catch (error) {
      if (error instanceof MontosFiscalesError) throw fiscalError(error.code, error.message);
      throw error;
    }
    if (totales.montoTotalMinor !== toMinorUnits(documento.totalEsperado)) {
      throw fiscalError(
        'FISCAL_TOTAL_MISMATCH',
        `El total fiscal (${totales.montoTotal}) no coincide con el de la factura (${documento.totalEsperado}).`,
      );
    }

    const [serie] = await this.sequelize.query<{ last_number: string }>(
      `UPDATE atlas_accounting.siat_number_series
          SET last_number = last_number + 1, updated_at = now()
        WHERE issuer_profile_id = $1
        RETURNING last_number`,
      { bind: [perfil.id], type: QueryTypes.SELECT, transaction },
    );
    if (!serie) {
      throw fiscalError('FISCAL_SERIES_MISSING', 'El emisor no tiene serie fiscal.');
    }
    const numeroFactura = Number(serie.last_number);

    const fechaEmision = fechaHoraLocal(new Date(), preparada.zona);
    const esNit = receptor.codigoTipoDocumentoIdentidad === TIPO_DOCUMENTO_NIT;
    // Fuera de línea el NIT no se puede verificar: el SIN pide `codigoExcepcion=1` siempre.
    const codigoExcepcion = esNit && (codigoEmision === 2 || preparada.nitValido === false) ? 1 : 0;

    const cuf = calcularCuf({
      nit: perfil.nit,
      fechaEmision,
      codigoSucursal: perfil.codigoSucursal,
      codigoModalidad: perfil.codigoModalidad,
      codigoEmision,
      tipoFacturaDocumento: 1,
      codigoDocumentoSector: perfil.codigoDocumentoSector,
      numeroFactura,
      codigoPuntoVenta: perfil.codigoPuntoVenta,
      codigoControl: cufd.codigoControl,
    });

    const detalle: DetalleFactura[] = documento.lineas.map((linea, indice) => ({
      actividadEconomica: linea.actividadEconomica ?? perfil.actividadEconomica,
      codigoProductoSin: linea.codigoProductoSin,
      codigoProducto: linea.codigoProducto,
      descripcion: linea.descripcion,
      cantidad: totales.lineas[indice]!.cantidad,
      unidadMedida: linea.unidadMedida,
      precioUnitario: totales.lineas[indice]!.precioUnitario,
      montoDescuento: totales.lineas[indice]!.montoDescuento,
      subTotal: totales.lineas[indice]!.subTotal,
      numeroSerie: null,
      numeroImei: null,
    }));
    const xml = construirFacturaXml(
      perfil.codigoModalidad,
      {
        nitEmisor: perfil.nit,
        razonSocialEmisor: perfil.razonSocial,
        municipio: perfil.municipio,
        telefono: perfil.telefono,
        numeroFactura,
        cuf,
        cufd: cufd.codigo,
        codigoSucursal: perfil.codigoSucursal,
        // La dirección que el SIN devolvió con el CUFD es la del padrón; si no vino, la del perfil.
        direccion: cufd.direccion ?? perfil.direccion,
        codigoPuntoVenta: perfil.codigoPuntoVenta,
        fechaEmision,
        nombreRazonSocial: receptor.nombreRazonSocial.slice(0, 500),
        codigoTipoDocumentoIdentidad: receptor.codigoTipoDocumentoIdentidad,
        numeroDocumento: receptor.numeroDocumento,
        complemento: receptor.complemento ?? null,
        codigoCliente: receptor.codigoCliente.slice(0, 100),
        codigoMetodoPago: documento.codigoMetodoPago ?? 1,
        numeroTarjeta: null,
        montoTotal: totales.montoTotal,
        montoTotalSujetoIva: totales.montoTotalSujetoIva,
        codigoMoneda: 1,
        tipoCambio: '1',
        montoTotalMoneda: totales.montoTotalMoneda,
        montoGiftCard: null,
        descuentoAdicional: totales.descuentoAdicional,
        codigoExcepcion,
        cafc: null,
        leyenda: (documento.leyenda ?? perfil.leyendaDefault ?? LEYENDA_POR_DEFECTO).slice(0, 200),
        usuario: perfil.usuarioEmisor,
        codigoDocumentoSector: perfil.codigoDocumentoSector,
      },
      detalle,
    );
    const archivo = comprimir(xml);

    return this.documentModel.create(
      {
        arInvoiceId: documento.sourceType === 'AR_INVOICE' ? documento.sourceId : null,
        sourceType: documento.sourceType,
        sourceId: documento.sourceId,
        issuerProfileId: perfil.id,
        numeroFactura: String(numeroFactura),
        cuf,
        cufd: cufd.codigo,
        cufdId: cufd.id,
        cuis: cuis.codigo,
        codigoDocumentoSector: perfil.codigoDocumentoSector,
        tipoFacturaDocumento: 1,
        codigoEmision,
        codigoModalidad: perfil.codigoModalidad,
        codigoExcepcion,
        fechaEmision,
        emittedAt: new Date(),
        siatStatus: codigoEmision === 1 ? 'QUEUED' : 'OFFLINE',
        contingencyFlag: codigoEmision === 2,
        eventId: preparada.evento?.id ?? null,
        xmlGzip: archivo.gzip,
        xmlSha256: archivo.sha256,
        xmlHash: archivo.sha256,
        receptorSnapshot: { ...receptor },
        montoTotal: totales.montoTotal,
        nextAttemptAt: codigoEmision === 1 ? new Date() : null,
        mensajes: [],
      },
      { transaction },
    );
  }
}

/** Leyenda por defecto mientras no haya catálogo sincronizado ni una configurada en el emisor. */
export const LEYENDA_POR_DEFECTO =
  'Ley N° 453: Tienes derecho a recibir información sobre las características y contenidos de los servicios que utilices.';
