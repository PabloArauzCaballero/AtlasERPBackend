import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { env } from '../../../../config/env';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';
import { SiatCufdModel, SiatCuisModel, SiatIssuerProfileModel } from '../../../../database/models';
import { CODIGO_ESTADO } from '../domain/siat-codes';
import { OPERACIONES, sincronizacion } from '../infrastructure/siat-transport';
import { rechazoDelSin } from './siat-errors';
import { SiatGatewayService } from './siat-gateway.service';

const DIA_MS = 24 * 60 * 60 * 1000;
/** El CUIS dura 365 días y se renueva desde 5 días antes del vencimiento. */
const RENOVAR_CUIS_ANTES_MS = 5 * DIA_MS;
/** El CUFD dura 24 h: se pide uno nuevo a las 20 h para no emitir con uno a punto de caducar. */
const VIDA_UTIL_CUFD_MS = 20 * 60 * 60 * 1000;
/** `verificarComunicacion` se cachea: no se le pregunta al SIN antes de CADA factura. */
const CACHE_COMUNICACION_MS = 60_000;

/**
 * Códigos del SIN: CUIS por sucursal/punto de venta (365 días) y CUFD diario. Las dos se piden por
 * adelantado y se guardan con su historia; el CUFD con el que se emite una factura queda enlazado
 * a ella (`cufd_id`), porque es el suyo y no el vigente el que se envía y el que entra en el CUF.
 */
@Injectable()
export class SiatCredentialsService {
  private comunicacion: { ok: boolean; en: number } | null = null;

  constructor(
    private readonly gateway: SiatGatewayService,
    @InjectModel(SiatCuisModel) private readonly cuisModel: typeof SiatCuisModel,
    @InjectModel(SiatCufdModel) private readonly cufdModel: typeof SiatCufdModel,
    private readonly sequelize: Sequelize,
    private readonly logger: PinoLoggerService,
  ) {}

  async verificarComunicacion(forzar = false): Promise<boolean> {
    if (!forzar && this.comunicacion && Date.now() - this.comunicacion.en < CACHE_COMUNICACION_MS) {
      return this.comunicacion.ok;
    }
    let ok = false;
    try {
      const { respuesta } = await this.gateway.llamar(null, OPERACIONES.verificarComunicacion, {});
      ok = (respuesta.mensajesList ?? []).some(
        (m) => m.codigo === CODIGO_ESTADO.COMUNICACION_EXITOSA,
      );
    } catch {
      ok = false;
    }
    this.comunicacion = { ok, en: Date.now() };
    return ok;
  }

  async cuisVigente(perfil: SiatIssuerProfileModel, forzar = false): Promise<SiatCuisModel> {
    const limite = new Date(Date.now() + RENOVAR_CUIS_ANTES_MS);
    if (!forzar) {
      const vigente = await this.cuisModel.findOne({
        where: { issuerProfileId: perfil.id, isActive: true, fechaVigencia: { [Op.gt]: limite } },
        order: [['fechaVigencia', 'DESC']],
      });
      if (vigente) return vigente;
    }
    const { respuesta } = await this.gateway.llamarOperador(perfil.id, OPERACIONES.cuis, {
      ...this.gateway.solicitudBase(perfil),
    });
    // Con un CUIS ya vigente el SIN responde 970/980 y PUEDE devolver el código igualmente: se adopta.
    const codigo = typeof respuesta.codigo === 'string' ? respuesta.codigo : null;
    if (!codigo) throw rechazoDelSin('cuis', respuesta.mensajesList);
    const fechaVigencia = new Date(String(respuesta.fechaVigencia));
    if (Number.isNaN(fechaVigencia.getTime())) throw rechazoDelSin('cuis', respuesta.mensajesList);
    return this.sequelize.transaction(async (transaction) => {
      await this.cuisModel.update(
        { isActive: false },
        { where: { issuerProfileId: perfil.id, isActive: true }, transaction },
      );
      return this.cuisModel.create(
        {
          issuerProfileId: perfil.id,
          codigo,
          fechaVigencia,
          rawResponse: respuesta,
          isActive: true,
        },
        { transaction },
      );
    });
  }

  /** El CUFD con el que se emite ahora. `forzar` tras un 953 (no vigente) o un 914 (desconocido). */
  async cufdVigente(perfil: SiatIssuerProfileModel, forzar = false): Promise<SiatCufdModel> {
    if (!forzar) {
      const vigente = await this.cufdActual(perfil.id);
      if (vigente && Date.now() - vigente.obtainedAt.getTime() < VIDA_UTIL_CUFD_MS) return vigente;
    }
    return this.pedirCufd(perfil);
  }

  /** El último CUFD que se obtuvo y sigue en fecha, sin pedir otro. Base de la contingencia. */
  cufdActual(perfilId: string, transaction?: Transaction): Promise<SiatCufdModel | null> {
    return this.cufdModel.findOne({
      where: { issuerProfileId: perfilId, isActive: true, fechaVigencia: { [Op.gt]: new Date() } },
      order: [['obtainedAt', 'DESC']],
      transaction,
    });
  }

  async pedirCufd(perfil: SiatIssuerProfileModel): Promise<SiatCufdModel> {
    const cuis = await this.cuisVigente(perfil);
    await this.comprobarReloj(perfil, cuis.codigo);
    const { respuesta } = await this.gateway.llamarOperador(perfil.id, OPERACIONES.cufd, {
      ...this.gateway.solicitudBase(perfil),
      cuis: cuis.codigo,
    });
    const codigo = typeof respuesta.codigo === 'string' ? respuesta.codigo : null;
    const codigoControl =
      typeof respuesta.codigoControl === 'string' ? respuesta.codigoControl : null;
    const fechaVigencia = new Date(String(respuesta.fechaVigencia));
    if (!codigo || !codigoControl || Number.isNaN(fechaVigencia.getTime())) {
      throw rechazoDelSin('cufd', respuesta.mensajesList);
    }
    return this.sequelize.transaction(async (transaction) => {
      await this.cufdModel.update(
        { isActive: false },
        { where: { issuerProfileId: perfil.id, isActive: true }, transaction },
      );
      return this.cufdModel.create(
        {
          issuerProfileId: perfil.id,
          cuisId: cuis.id,
          codigo,
          codigoControl,
          direccion: typeof respuesta.direccion === 'string' ? respuesta.direccion : null,
          fechaVigencia,
          rawResponse: respuesta,
          isActive: true,
        },
        { transaction },
      );
    });
  }

  /**
   * El SIN valida la `fechaEmision` con SU reloj (1009). Antes de cada CUFD se compara con el
   * nuestro y un desfase mayor que `SIAT_CLOCK_DRIFT_ALERT_S` queda en el log como alerta.
   */
  async comprobarReloj(perfil: SiatIssuerProfileModel, cuis: string): Promise<number | null> {
    try {
      const { respuesta } = await this.gateway.llamar(
        perfil.id,
        sincronizacion('sincronizarFechaHora'),
        { ...this.gateway.solicitudBase(perfil), cuis },
      );
      const suHora = Date.parse(`${String(respuesta.fechaHora)}-04:00`);
      if (Number.isNaN(suHora)) return null;
      const desfaseS = Math.round(Math.abs(Date.now() - suHora) / 1000);
      if (desfaseS > env.SIAT_CLOCK_DRIFT_ALERT_S) {
        this.logger.warn('El reloj del ERP y el del SIN difieren más de lo tolerado.', {
          layer: 'service',
          module: 'fiscal-siat',
          alert: 'SIAT_CLOCK_DRIFT',
          desfaseS,
          umbralS: env.SIAT_CLOCK_DRIFT_ALERT_S,
        });
      }
      return desfaseS;
    } catch {
      return null;
    }
  }
}
