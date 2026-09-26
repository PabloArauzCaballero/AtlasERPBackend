import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { env } from '../../../../config/env';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';
import {
  ElectronicTaxDocumentModel,
  LegalEntityModel,
  SiatCufdModel,
  SiatIssuerProfileModel,
  SiatPackageModel,
  SiatSignificantEventModel,
} from '../../../../database/models';
import { fechaHoraLocal } from '../domain/fecha-local';
import { empaquetarFacturas } from '../domain/paquete-tar';
import { accionPara, CODIGO_ESTADO } from '../domain/siat-codes';
import { gunzipSync } from 'node:zlib';
import { OPERACIONES, SiatMensaje, SiatTransportError } from '../infrastructure/siat-transport';
import { SiatCredentialsService } from './siat-credentials.service';
import { SiatGatewayService } from './siat-gateway.service';

/** 2 = «Inaccesibilidad al servicio web de la Administración Tributaria» (a confirmar en F7). */
export const EVENTO_INACCESIBILIDAD_SIN = 2;
const MAX_FACTURAS_PAQUETE = 500;

/**
 * Contingencia: cuando el SIN no responde se emite fuera de línea con el último CUFD, bajo un
 * evento significativo. Al volver la conexión: CUFD nuevo → `registroEventoSignificativo` →
 * paquetes tar+gzip (≤ 500 facturas y ≤ `SIAT_PACKAGE_MAX_BYTES`) → validación hasta 908/904 →
 * estado por factura según `numeroArchivo`.
 *
 * El `cufd` de cada XML del paquete es el del EVENTO; el de la petición, el nuevo.
 */
@Injectable()
export class SiatContingencyService {
  constructor(
    private readonly gateway: SiatGatewayService,
    private readonly credentials: SiatCredentialsService,
    @InjectModel(SiatSignificantEventModel)
    private readonly eventModel: typeof SiatSignificantEventModel,
    @InjectModel(SiatPackageModel) private readonly packageModel: typeof SiatPackageModel,
    @InjectModel(SiatCufdModel) private readonly cufdModel: typeof SiatCufdModel,
    @InjectModel(SiatIssuerProfileModel)
    private readonly profileModel: typeof SiatIssuerProfileModel,
    @InjectModel(LegalEntityModel) private readonly legalEntityModel: typeof LegalEntityModel,
    @InjectModel(ElectronicTaxDocumentModel)
    private readonly documentModel: typeof ElectronicTaxDocumentModel,
    private readonly sequelize: Sequelize,
    private readonly logger: PinoLoggerService,
  ) {}

  eventoAbierto(perfilId: string) {
    return this.eventModel.findOne({ where: { issuerProfileId: perfilId, status: 'OPEN' } });
  }

  /** Abre el evento (uno por emisor: el índice parcial lo garantiza aunque haya dos instancias). */
  async abrir(
    perfil: SiatIssuerProfileModel,
    cufdEvento: SiatCufdModel,
    inicio: Date = new Date(),
  ): Promise<SiatSignificantEventModel> {
    const existente = await this.eventoAbierto(perfil.id);
    if (existente) return existente;
    try {
      const evento = await this.eventModel.create({
        issuerProfileId: perfil.id,
        codigoEvento: EVENTO_INACCESIBILIDAD_SIN,
        descripcion: 'INACCESIBILIDAD AL SERVICIO WEB DE LA ADMINISTRACIÓN TRIBUTARIA',
        // Un segundo antes: la primera factura fuera de línea tiene que caer DENTRO del evento.
        inicio: new Date(inicio.getTime() - 1000),
        cufdEventoId: cufdEvento.id,
        status: 'OPEN',
      });
      this.logger.warn(
        'Contingencia fiscal abierta: el SIN no responde, se emite fuera de línea.',
        {
          layer: 'service',
          module: 'fiscal-siat',
          alert: 'SIAT_CONTINGENCY_OPEN',
          issuerProfileId: perfil.id,
          eventId: evento.id,
        },
      );
      return evento;
    } catch {
      const otra = await this.eventoAbierto(perfil.id);
      if (otra) return otra;
      throw new Error('No se pudo abrir la contingencia fiscal.');
    }
  }

  /**
   * Una pasada: cierra y registra los eventos cuyo SIN ya responde, envía sus paquetes y valida
   * los pendientes. Idempotente: cada paso mira el estado guardado y sigue donde se quedó.
   */
  async procesar(): Promise<void> {
    if (!this.gateway.activo) return;
    await this.validarPaquetesPendientes();
    const eventos = await this.eventModel.findAll({
      where: { status: { [Op.in]: ['OPEN', 'CLOSED', 'REGISTERED'] } },
      order: [['inicio', 'ASC']],
    });
    if (eventos.length === 0) return;
    if (!(await this.credentials.verificarComunicacion(true))) return;
    for (const evento of eventos) {
      try {
        await this.despachar(evento);
      } catch (error) {
        this.logger.warn('No se pudo despachar la contingencia fiscal; se reintentará.', {
          layer: 'service',
          module: 'fiscal-siat',
          eventId: evento.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  async despachar(evento: SiatSignificantEventModel): Promise<void> {
    const perfil = await this.profileModel.findByPk(evento.issuerProfileId);
    if (!perfil) return;
    if (evento.status === 'OPEN') {
      await evento.update({ status: 'CLOSED', fin: new Date() });
    }
    if (evento.status === 'CLOSED') await this.registrar(evento, perfil);
    if (evento.status === 'REGISTERED') await this.enviarPaquetes(evento, perfil);
  }

  private async zona(perfil: SiatIssuerProfileModel) {
    return (
      (await this.legalEntityModel.findByPk(perfil.legalEntityId))?.timezone ?? 'America/La_Paz'
    );
  }

  private async registrar(evento: SiatSignificantEventModel, perfil: SiatIssuerProfileModel) {
    const zona = await this.zona(perfil);
    const cufdEvento = await this.cufdModel.findByPk(evento.cufdEventoId);
    const cufdNuevo = await this.credentials.cufdVigente(perfil, true);
    const cuis = await this.credentials.cuisVigente(perfil);
    const { respuesta } = await this.gateway.llamar(
      perfil.id,
      OPERACIONES.registroEventoSignificativo,
      {
        ...this.gateway.solicitudBase(perfil),
        cuis: cuis.codigo,
        cufd: cufdNuevo.codigo,
        cufdEvento: cufdEvento?.codigo,
        codigoMotivoEvento: evento.codigoEvento,
        descripcion: evento.descripcion,
        fechaHoraInicioEvento: fechaHoraLocal(evento.inicio, zona),
        fechaHoraFinEvento: fechaHoraLocal(evento.fin ?? new Date(), zona),
      },
    );
    const codigo = respuesta.codigoRecepcionEventoSignificativo;
    if (respuesta.transaccion === false || codigo === undefined || codigo === null) {
      this.logger.warn('El SIN no registró el evento significativo.', {
        layer: 'service',
        module: 'fiscal-siat',
        alert: 'SIAT_EVENT_REJECTED',
        eventId: evento.id,
        mensajes: respuesta.mensajesList,
      });
      return;
    }
    await evento.update({
      status: 'REGISTERED',
      codigoRecepcionEvento: String(codigo),
      cufdEnvioId: cufdNuevo.id,
    });
  }

  private async enviarPaquetes(evento: SiatSignificantEventModel, perfil: SiatIssuerProfileModel) {
    const documentos = await this.documentModel.findAll({
      where: { eventId: evento.id, siatStatus: 'OFFLINE' },
      order: [['numeroFactura', 'ASC']],
    });
    const cufdEnvio = evento.cufdEnvioId ? await this.cufdModel.findByPk(evento.cufdEnvioId) : null;
    if (!cufdEnvio) return;
    const zona = await this.zona(perfil);
    for (const lote of this.lotes(documentos)) {
      const facturas = lote.map((d) => ({
        numeroFactura: d.numeroFactura!,
        xml: gunzipSync(d.xmlGzip!).toString('utf8'),
      }));
      const paquete = empaquetarFacturas(facturas);
      const { respuesta } = await this.gateway.llamar(
        perfil.id,
        OPERACIONES.recepcionPaqueteFactura,
        {
          ...this.gateway.solicitudBase(perfil),
          codigoDocumentoSector: perfil.codigoDocumentoSector,
          codigoEmision: 2,
          tipoFacturaDocumento: 1,
          cuis: lote[0]!.cuis,
          cufd: cufdEnvio.codigo,
          archivo: paquete.gzip.toString('base64'),
          fechaEnvio: fechaHoraLocal(new Date(), zona),
          hashArchivo: paquete.sha256,
          cantidadFacturas: lote.length,
          codigoEvento: Number(evento.codigoRecepcionEvento),
        },
      );
      if (respuesta.codigoEstado !== CODIGO_ESTADO.PENDIENTE || !respuesta.codigoRecepcion) {
        this.logger.warn('El SIN no recibió el paquete de contingencia.', {
          layer: 'service',
          module: 'fiscal-siat',
          alert: 'SIAT_PACKAGE_REJECTED',
          eventId: evento.id,
          mensajes: respuesta.mensajesList,
        });
        return;
      }
      await this.sequelize.transaction(async (transaction) => {
        const creado = await this.packageModel.create(
          {
            eventId: evento.id,
            cantidadFacturas: lote.length,
            hashArchivo: paquete.sha256,
            bytes: paquete.gzip.length,
            codigoRecepcion: String(respuesta.codigoRecepcion),
            codigoEstado: respuesta.codigoEstado,
            sentAt: new Date(),
          },
          { transaction },
        );
        await this.documentModel.update(
          { siatStatus: 'PACKAGED', packageId: creado.id, sentAt: new Date() },
          { where: { id: { [Op.in]: lote.map((d) => d.id) } }, transaction },
        );
      });
    }
    const quedan = await this.documentModel.count({
      where: { eventId: evento.id, siatStatus: 'OFFLINE' },
    });
    if (quedan === 0) await evento.update({ status: 'DISPATCHED' });
  }

  /** Lotes de ≤ 500 facturas y ≤ `SIAT_PACKAGE_MAX_BYTES` (el gzip de cada XML es una cota). */
  private lotes(documentos: ElectronicTaxDocumentModel[]): ElectronicTaxDocumentModel[][] {
    const lotes: ElectronicTaxDocumentModel[][] = [];
    let actual: ElectronicTaxDocumentModel[] = [];
    let bytes = 0;
    for (const documento of documentos) {
      const peso = (documento.xmlGzip?.length ?? 0) * 2;
      if (
        actual.length === MAX_FACTURAS_PAQUETE ||
        (actual.length > 0 && bytes + peso > env.SIAT_PACKAGE_MAX_BYTES)
      ) {
        lotes.push(actual);
        actual = [];
        bytes = 0;
      }
      actual.push(documento);
      bytes += peso;
    }
    if (actual.length) lotes.push(actual);
    return lotes;
  }

  async validarPaquetesPendientes(): Promise<void> {
    const paquetes = await this.packageModel.findAll({
      where: { validatedAt: null, codigoRecepcion: { [Op.ne]: null } },
    });
    for (const paquete of paquetes) {
      const evento = await this.eventModel.findByPk(paquete.eventId);
      const perfil = evento ? await this.profileModel.findByPk(evento.issuerProfileId) : null;
      const cufd = evento?.cufdEnvioId ? await this.cufdModel.findByPk(evento.cufdEnvioId) : null;
      if (!perfil || !cufd) continue;
      const documentos = await this.documentModel.findAll({
        where: { packageId: paquete.id },
        order: [['numeroFactura', 'ASC']],
      });
      let respuesta;
      try {
        ({ respuesta } = await this.gateway.llamar(
          perfil.id,
          OPERACIONES.validacionRecepcionPaqueteFactura,
          {
            ...this.gateway.solicitudBase(perfil),
            codigoDocumentoSector: perfil.codigoDocumentoSector,
            codigoEmision: 2,
            tipoFacturaDocumento: 1,
            cuis: documentos[0]?.cuis,
            cufd: cufd.codigo,
            codigoRecepcion: paquete.codigoRecepcion,
          },
        ));
      } catch (error) {
        if (error instanceof SiatTransportError) continue;
        throw error;
      }
      if (respuesta.codigoEstado === CODIGO_ESTADO.PENDIENTE) continue;
      await this.aplicarResultado(
        paquete,
        documentos,
        respuesta.codigoEstado ?? null,
        respuesta.mensajesList ?? [],
      );
    }
  }

  /** 908: todas validadas. 904/902: cada factura según sus mensajes (`numeroArchivo` = posición en el tar). */
  private async aplicarResultado(
    paquete: SiatPackageModel,
    documentos: ElectronicTaxDocumentModel[],
    codigoEstado: number | null,
    mensajes: SiatMensaje[],
  ) {
    await this.sequelize.transaction(async (transaction) => {
      for (const [indice, documento] of documentos.entries()) {
        const propios = mensajes.filter((m) => m.numeroArchivo === indice);
        const errores = propios.filter(
          (m) => !m.advertencia && accionPara(m.codigo) !== 'ADVERTENCIA',
        );
        const siatStatus =
          codigoEstado === CODIGO_ESTADO.RECHAZADA && propios.length === 0
            ? 'REJECTED'
            : errores.length > 0
              ? 'REJECTED'
              : propios.length > 0
                ? 'OBSERVED'
                : 'ACCEPTED';
        await documento.update(
          {
            siatStatus,
            codigoEstadoSin: siatStatus === 'ACCEPTED' ? CODIGO_ESTADO.VALIDADA : codigoEstado,
            mensajes: propios,
            codigoRecepcion: paquete.codigoRecepcion,
          },
          { transaction },
        );
      }
      await paquete.update({ codigoEstado, mensajes, validatedAt: new Date() }, { transaction });
    });
  }
}
