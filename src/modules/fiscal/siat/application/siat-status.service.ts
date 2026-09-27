import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  SiatCatalogSyncRunModel,
  SiatCuisModel,
  SiatIssuerProfileModel,
  SiatSignificantEventModel,
} from '../../../../database/models';
import { SiatCredentialsService } from './siat-credentials.service';
import { SiatGatewayService } from './siat-gateway.service';

/** Lo que un operador necesita saber de un emisor antes de facturar: ¿hay SIN y hay CUFD? */
@Injectable()
export class SiatStatusService {
  constructor(
    private readonly gateway: SiatGatewayService,
    private readonly credentials: SiatCredentialsService,
    @InjectModel(SiatCuisModel) private readonly cuisModel: typeof SiatCuisModel,
    @InjectModel(SiatCatalogSyncRunModel)
    private readonly runModel: typeof SiatCatalogSyncRunModel,
    @InjectModel(SiatSignificantEventModel)
    private readonly eventModel: typeof SiatSignificantEventModel,
  ) {}

  async estado(perfil: SiatIssuerProfileModel) {
    const activo = this.gateway.activo;
    const [comunicacion, cuis, cufd, ultimaSincronizacion, contingencia] = await Promise.all([
      activo ? this.credentials.verificarComunicacion(true) : Promise.resolve(null),
      this.cuisModel.findOne({
        where: { issuerProfileId: perfil.id, isActive: true },
        order: [['fechaVigencia', 'DESC']],
      }),
      this.credentials.cufdActual(perfil.id),
      this.runModel.findOne({
        where: { issuerProfileId: perfil.id },
        order: [['startedAt', 'DESC']],
      }),
      this.eventModel.findOne({ where: { issuerProfileId: perfil.id, status: 'OPEN' } }),
    ]);
    return {
      mode: this.gateway.modo,
      codigoAmbiente: activo ? this.gateway.codigoAmbiente : null,
      comunicacion: comunicacion === null ? null : comunicacion ? 926 : null,
      comunicacionOk: comunicacion,
      cuisVigenteHasta: cuis?.fechaVigencia ?? null,
      cufdVigenteHasta: cufd?.fechaVigencia ?? null,
      cufdObtenidoEn: cufd?.obtainedAt ?? null,
      ultimaSincronizacion: ultimaSincronizacion
        ? {
            en: ultimaSincronizacion.startedAt,
            ok: ultimaSincronizacion.ok,
            catalogos: ultimaSincronizacion.catalogs,
            error: ultimaSincronizacion.error,
          }
        : null,
      contingenciaAbierta: contingencia
        ? {
            id: contingencia.id,
            desde: contingencia.inicio,
            codigoEvento: contingencia.codigoEvento,
          }
        : null,
    };
  }
}
