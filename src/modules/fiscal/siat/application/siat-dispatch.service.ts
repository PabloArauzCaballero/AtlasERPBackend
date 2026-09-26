import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { gunzipSync } from 'node:zlib';
import { Op, QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { env } from '../../../../config/env';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';
import {
  ElectronicTaxDocumentModel,
  LegalEntityModel,
  SiatCufdModel,
  SiatIssuerProfileModel,
} from '../../../../database/models';
import { calcularCuf } from '../domain/cuf';
import { escaparXml } from '../domain/factura-xml';
import { fechaHoraLocal } from '../domain/fecha-local';
import { comprimir } from '../domain/paquete-tar';
import { accionPara, CODIGO_ESTADO } from '../domain/siat-codes';
import {
  OPERACIONES,
  SiatMensaje,
  SiatRespuesta,
  SiatTransportError,
} from '../infrastructure/siat-transport';
import { TIPO_DOCUMENTO_NIT } from './siat-emission.service';
import { SiatContingencyService } from './siat-contingency.service';
import { SiatGatewayService } from './siat-gateway.service';

const LOTE = 10;
const ESPERA_MAXIMA_MS = 60_000;

type Desenlace =
  | {
      estado: 'ACCEPTED' | 'OBSERVED' | 'REJECTED' | 'VOIDED';
      codigo: number | null;
      mensajes: SiatMensaje[];
    }
  | { estado: 'CONSULTAR'; mensajes: SiatMensaje[] }
  | { estado: 'REGENERAR'; mensajes: SiatMensaje[] }
  | { estado: 'ERROR'; mensajes: SiatMensaje[]; motivo: string; alerta: boolean };

/**
 * El procesador de la cola fiscal: envía los documentos `QUEUED`/`ERROR` al SIN y aplica su
 * respuesta. Reglas que no se negocian (plan §2.3):
 *
 * - **Reclamación CAS por fila** (`FOR UPDATE SKIP LOCKED` + `UPDATE … WHERE siat_status IN
 *   (…)`): con dos instancias durante un despliegue, una sola envía cada documento.
 * - Se reenvía SIEMPRE el mismo gzip con el mismo CUF, y con el CUFD del documento, no el vigente.
 * - Tras un fallo posterior al envío (time-out, 5xx) o un 952, primero se CONSULTA el estado por
 *   CUF y se adopta; nunca se reenvía a ciegas.
 * - Un código que no está clasificado es `ERROR` reintentable con alerta, nunca `REJECTED`.
 * - Agotada la ventana en línea (intentos o tiempo), o con 1009 / credenciales vencidas, el
 *   documento se regenera FUERA DE LÍNEA (nuevo CUF con emisión 2, mismo número y fecha) bajo un
 *   evento de contingencia.
 */
@Injectable()
export class SiatDispatchService {
  constructor(
    private readonly gateway: SiatGatewayService,
    private readonly contingency: SiatContingencyService,
    @InjectModel(ElectronicTaxDocumentModel)
    private readonly documentModel: typeof ElectronicTaxDocumentModel,
    @InjectModel(SiatIssuerProfileModel)
    private readonly profileModel: typeof SiatIssuerProfileModel,
    @InjectModel(SiatCufdModel) private readonly cufdModel: typeof SiatCufdModel,
    @InjectModel(LegalEntityModel) private readonly legalEntityModel: typeof LegalEntityModel,
    private readonly sequelize: Sequelize,
    private readonly logger: PinoLoggerService,
  ) {}

  /** Una pasada completa: huérfanos, cola en línea y contingencias. */
  async procesar(): Promise<{ enviados: number }> {
    if (!this.gateway.activo) return { enviados: 0 };
    await this.rescatarHuerfanos();
    const ids = await this.reclamar();
    for (const id of ids) await this.enviar(id);
    await this.contingency.procesar();
    return { enviados: ids.length };
  }

  /** CAS: sólo quien pasa la fila de QUEUED/ERROR a SENT la envía. */
  async reclamar(limite = LOTE): Promise<string[]> {
    return this.sequelize.transaction(async (transaction) => {
      const filas = await this.sequelize.query<{ id: string }>(
        `SELECT id FROM atlas_accounting.electronic_tax_document
          WHERE siat_status IN ('QUEUED', 'ERROR') AND codigo_emision = 1
            AND next_attempt_at IS NOT NULL AND next_attempt_at <= now()
          ORDER BY next_attempt_at
          LIMIT $1
          FOR UPDATE SKIP LOCKED`,
        { bind: [limite], type: QueryTypes.SELECT, transaction },
      );
      if (filas.length === 0) return [];
      const reclamadas = await this.sequelize.query<{ id: string }>(
        `UPDATE atlas_accounting.electronic_tax_document
            SET siat_status = 'SENT', sent_at = now(), attempt_count = attempt_count + 1,
                updated_at = now()
          WHERE id = ANY($1::uuid[]) AND siat_status IN ('QUEUED', 'ERROR')
          RETURNING id`,
        { bind: [filas.map((f) => f.id)], type: QueryTypes.SELECT, transaction },
      );
      return reclamadas.map((f) => f.id);
    });
  }

  /** `SENT` cuya respuesta nunca llegó (proceso caído a mitad): se consulta y se adopta. */
  async rescatarHuerfanos(): Promise<void> {
    const limite = new Date(Date.now() - env.SIAT_HTTP_TIMEOUT_MS - 60_000);
    const huerfanos = await this.documentModel.findAll({
      where: { siatStatus: 'SENT', codigoEmision: 1, sentAt: { [Op.lt]: limite } },
      limit: LOTE,
    });
    for (const documento of huerfanos) {
      await this.aplicar(documento, await this.consultar(documento));
    }
  }

  async enviar(id: string): Promise<void> {
    const documento = await this.documentModel.findByPk(id);
    if (!documento || documento.siatStatus !== 'SENT') return;
    const contexto = await this.contexto(documento);
    if (!contexto) return;
    const { perfil, cufd, zona } = contexto;
    let desenlace: Desenlace;
    try {
      const { respuesta } = await this.gateway.llamar(perfil.id, OPERACIONES.recepcionFactura, {
        ...this.gateway.solicitudBase(perfil),
        codigoDocumentoSector: documento.codigoDocumentoSector,
        codigoEmision: 1,
        tipoFacturaDocumento: documento.tipoFacturaDocumento,
        cuis: documento.cuis,
        cufd: cufd.codigo,
        archivo: documento.xmlGzip!.toString('base64'),
        fechaEnvio: fechaHoraLocal(new Date(), zona),
        hashArchivo: documento.xmlSha256,
      });
      desenlace = this.interpretarRecepcion(respuesta);
      if (desenlace.estado === 'CONSULTAR') desenlace = await this.consultar(documento);
    } catch (error) {
      if (!(error instanceof SiatTransportError)) throw error;
      desenlace = error.detalle.enviado
        ? await this.consultar(documento)
        : { estado: 'ERROR', mensajes: [], motivo: error.message, alerta: false };
    }
    await this.aplicar(documento, desenlace);
  }

  /** Qué hacer con la respuesta de `recepcionFactura`. */
  interpretarRecepcion(respuesta: SiatRespuesta): Desenlace {
    const mensajes = respuesta.mensajesList ?? [];
    switch (respuesta.codigoEstado) {
      case CODIGO_ESTADO.VALIDADA:
        return { estado: 'ACCEPTED', codigo: 908, mensajes };
      case CODIGO_ESTADO.OBSERVADA:
        return { estado: 'OBSERVED', codigo: 904, mensajes };
      case CODIGO_ESTADO.RECHAZADA:
        break;
      default:
        return {
          estado: 'ERROR',
          mensajes,
          motivo: `Estado del SIN no previsto: ${String(respuesta.codigoEstado)}`,
          alerta: true,
        };
    }
    const acciones = mensajes.map((m) => ({ codigo: m.codigo, accion: accionPara(m.codigo) }));
    if (acciones.some((a) => a.accion === 'CONSULTAR')) return { estado: 'CONSULTAR', mensajes };
    if (acciones.some((a) => a.accion === 'RENOVAR_CREDENCIALES' || a.codigo === 1009)) {
      return { estado: 'REGENERAR', mensajes };
    }
    if (
      acciones.length === 0 ||
      acciones.some((a) => ['DESCONOCIDO', 'TRANSPORTE', 'ENVIO'].includes(a.accion))
    ) {
      return {
        estado: 'ERROR',
        mensajes,
        motivo: 'El SIN rechazó con un código que no es del documento; se reintenta.',
        alerta: acciones.some((a) => a.accion === 'DESCONOCIDO') || acciones.length === 0,
      };
    }
    return { estado: 'REJECTED', codigo: 902, mensajes };
  }

  /** `verificacionEstadoFactura`: la verdad del SIN sobre ese CUF. */
  async consultar(documento: ElectronicTaxDocumentModel): Promise<Desenlace> {
    const contexto = await this.contexto(documento);
    if (!contexto) return { estado: 'ERROR', mensajes: [], motivo: 'Sin emisor', alerta: true };
    try {
      const { respuesta } = await this.gateway.llamar(
        contexto.perfil.id,
        OPERACIONES.verificacionEstadoFactura,
        {
          ...this.gateway.solicitudBase(contexto.perfil),
          codigoDocumentoSector: documento.codigoDocumentoSector,
          codigoEmision: documento.codigoEmision,
          tipoFacturaDocumento: documento.tipoFacturaDocumento,
          cuis: documento.cuis,
          cufd: contexto.cufd.codigo,
          cuf: documento.cuf,
        },
      );
      const mensajes = respuesta.mensajesList ?? [];
      if (respuesta.codigoEstado === CODIGO_ESTADO.VALIDADA)
        return { estado: 'ACCEPTED', codigo: 908, mensajes };
      if (respuesta.codigoEstado === CODIGO_ESTADO.OBSERVADA)
        return { estado: 'OBSERVED', codigo: 904, mensajes };
      if (respuesta.codigoEstado === CODIGO_ESTADO.ANULACION_CONFIRMADA)
        return { estado: 'VOIDED', codigo: 905, mensajes };
      // 946/924: el SIN no la tiene. No llegó: se reencola (mismo CUF, mismo gzip).
      return {
        estado: 'ERROR',
        mensajes,
        motivo: 'El SIN no tiene registrada la factura; se reenvía.',
        alerta: false,
      };
    } catch (error) {
      if (!(error instanceof SiatTransportError)) throw error;
      return {
        estado: 'ERROR',
        mensajes: [],
        motivo: `Sin respuesta al consultar: ${error.message}`,
        alerta: false,
      };
    }
  }

  private async aplicar(
    documento: ElectronicTaxDocumentModel,
    desenlace: Desenlace,
  ): Promise<void> {
    if (
      desenlace.estado === 'ACCEPTED' ||
      desenlace.estado === 'OBSERVED' ||
      desenlace.estado === 'REJECTED' ||
      desenlace.estado === 'VOIDED'
    ) {
      await documento.update({
        siatStatus: desenlace.estado,
        codigoEstadoSin: desenlace.codigo,
        mensajes: desenlace.mensajes,
        lastError: null,
        nextAttemptAt: null,
      });
      return;
    }
    if (desenlace.estado === 'REGENERAR' || this.ventanaAgotada(documento)) {
      await this.regenerarFueraDeLinea(documento, desenlace.mensajes);
      return;
    }
    const motivo = desenlace.estado === 'ERROR' ? desenlace.motivo : 'Consulta sin respuesta';
    if (desenlace.estado === 'ERROR' && desenlace.alerta) {
      this.logger.warn(
        'El SIN respondió algo que el ERP no sabe clasificar; el documento queda en ERROR.',
        {
          layer: 'service',
          module: 'fiscal-siat',
          alert: 'SIAT_UNCLASSIFIED_RESPONSE',
          documentId: documento.id,
          mensajes: desenlace.mensajes,
        },
      );
    }
    const espera = Math.min(2 ** documento.attemptCount * 5_000, ESPERA_MAXIMA_MS);
    await documento.update({
      siatStatus: 'ERROR',
      mensajes: desenlace.mensajes,
      lastError: motivo,
      nextAttemptAt: new Date(Date.now() + espera),
    });
  }

  private ventanaAgotada(documento: ElectronicTaxDocumentModel): boolean {
    const edadMs = Date.now() - (documento.emittedAt?.getTime() ?? Date.now());
    return (
      documento.attemptCount >= env.SIAT_ONLINE_MAX_ATTEMPTS ||
      edadMs > env.SIAT_ONLINE_WINDOW_S * 1000
    );
  }

  /**
   * Mismo número y misma `fechaEmision`, CUF nuevo con emisión 2, bajo un evento de contingencia
   * cuyo CUFD es el del documento. Con NIT el SIN pide `codigoExcepcion=1` fuera de línea.
   */
  async regenerarFueraDeLinea(documento: ElectronicTaxDocumentModel, mensajes: SiatMensaje[] = []) {
    const contexto = await this.contexto(documento);
    if (!contexto) return;
    const { perfil, cufd } = contexto;
    const evento = await this.contingency.abrir(perfil, cufd, documento.emittedAt ?? new Date());
    // Todas las facturas de un paquete llevan el CUFD del EVENTO (si no, 1006): si ya había uno
    // abierto con otro CUFD, el documento pasa a ese.
    const cufdEvento =
      evento.cufdEventoId === cufd.id ? cufd : await this.cufdModel.findByPk(evento.cufdEventoId);
    if (!cufdEvento) return;
    const cuf = calcularCuf({
      nit: perfil.nit,
      fechaEmision: documento.fechaEmision!,
      codigoSucursal: perfil.codigoSucursal,
      codigoModalidad: documento.codigoModalidad!,
      codigoEmision: 2,
      tipoFacturaDocumento: documento.tipoFacturaDocumento!,
      codigoDocumentoSector: documento.codigoDocumentoSector!,
      numeroFactura: documento.numeroFactura!,
      codigoPuntoVenta: perfil.codigoPuntoVenta,
      codigoControl: cufdEvento.codigoControl,
    });
    const receptor = documento.receptorSnapshot as { codigoTipoDocumentoIdentidad?: number } | null;
    const codigoExcepcion = receptor?.codigoTipoDocumentoIdentidad === TIPO_DOCUMENTO_NIT ? 1 : 0;
    const xml = gunzipSync(documento.xmlGzip!)
      .toString('utf8')
      .replace(/<cuf>[^<]*<\/cuf>/, `<cuf>${escaparXml(cuf)}</cuf>`)
      .replace(/<cufd>[^<]*<\/cufd>/, `<cufd>${escaparXml(cufdEvento.codigo)}</cufd>`)
      .replace(
        /<codigoExcepcion(?: xsi:nil="true")?\/>|<codigoExcepcion>[^<]*<\/codigoExcepcion>/,
        `<codigoExcepcion>${codigoExcepcion}</codigoExcepcion>`,
      );
    const archivo = comprimir(xml);
    await documento.update({
      cuf,
      cufd: cufdEvento.codigo,
      cufdId: cufdEvento.id,
      codigoEmision: 2,
      codigoExcepcion,
      contingencyFlag: true,
      eventId: evento.id,
      xmlGzip: archivo.gzip,
      xmlSha256: archivo.sha256,
      xmlHash: archivo.sha256,
      siatStatus: 'OFFLINE',
      mensajes,
      nextAttemptAt: null,
      lastError: null,
    });
  }

  private async contexto(documento: ElectronicTaxDocumentModel) {
    const perfil = documento.issuerProfileId
      ? await this.profileModel.findByPk(documento.issuerProfileId)
      : null;
    const cufd = documento.cufdId ? await this.cufdModel.findByPk(documento.cufdId) : null;
    if (!perfil || !cufd) return null;
    const zona =
      (await this.legalEntityModel.findByPk(perfil.legalEntityId))?.timezone ?? 'America/La_Paz';
    return { perfil, cufd, zona };
  }

  /** `POST …/retry`: sólo adelanta el próximo intento; nunca llama al SIN desde la petición. */
  async adelantar(id: string): Promise<boolean> {
    const [filas] = await this.documentModel.update(
      { nextAttemptAt: new Date() },
      { where: { id, siatStatus: 'ERROR' } },
    );
    return filas > 0;
  }
}
