import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { createHash } from 'node:crypto';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  SiatCatalogItemModel,
  SiatCatalogSyncRunModel,
  SiatIssuerProfileModel,
} from '../../../../database/models';
import { SiatRespuesta, sincronizacion } from '../infrastructure/siat-transport';
import { rechazoDelSin } from './siat-errors';
import { SiatCredentialsService } from './siat-credentials.service';
import { SiatGatewayService } from './siat-gateway.service';

interface FilaCatalogo {
  codigo: string;
  descripcion: string;
  extra: Record<string, unknown>;
}

type Extractor = (respuesta: SiatRespuesta) => FilaCatalogo[];

const lista = (respuesta: SiatRespuesta, campo: string): Record<string, unknown>[] =>
  Array.isArray(respuesta[campo]) ? (respuesta[campo] as Record<string, unknown>[]) : [];

const parametrica: Extractor = (r) =>
  lista(r, 'listaCodigos').map((item) => ({
    codigo: String(item.codigoClasificador),
    descripcion: String(item.descripcion ?? ''),
    extra: {},
  }));

const huella = (texto: string) => createHash('sha1').update(texto).digest('hex').slice(0, 10);

/**
 * Catálogo del ERP ← operación de sincronización del SIN. `sincronizarFechaHora` no es un
 * catálogo: la usa `SiatCredentialsService` para vigilar el reloj.
 */
export const CATALOGOS_SIN: Readonly<Record<string, { operacion: string; extraer: Extractor }>> = {
  ACTIVIDADES: {
    operacion: 'sincronizarActividades',
    extraer: (r) =>
      lista(r, 'listaActividades').map((i) => ({
        codigo: String(i.codigoCaeb),
        descripcion: String(i.descripcion ?? ''),
        extra: { tipoActividad: i.tipoActividad ?? null },
      })),
  },
  ACTIVIDADES_DOC_SECTOR: {
    operacion: 'sincronizarListaActividadesDocumentoSector',
    extraer: (r) =>
      lista(r, 'listaActividadesDocumentoSector').map((i) => ({
        codigo: `${String(i.codigoActividad)}|${String(i.codigoDocumentoSector)}`,
        descripcion: String(i.tipoDocumentoSector ?? ''),
        extra: {
          codigoActividad: i.codigoActividad,
          codigoDocumentoSector: i.codigoDocumentoSector,
        },
      })),
  },
  LEYENDAS: {
    operacion: 'sincronizarListaLeyendasFactura',
    // Una actividad tiene varias leyendas y el SIN no les da código: se identifican por su texto.
    extraer: (r) =>
      lista(r, 'listaLeyendas').map((i) => ({
        codigo: `${String(i.codigoActividad)}|${huella(String(i.descripcionLeyenda ?? ''))}`,
        descripcion: String(i.descripcionLeyenda ?? ''),
        extra: { codigoActividad: i.codigoActividad },
      })),
  },
  PRODUCTOS: {
    operacion: 'sincronizarListaProductosServicios',
    extraer: (r) =>
      lista(r, 'listaCodigos').map((i) => ({
        codigo: `${String(i.codigoActividad)}|${String(i.codigoProducto)}`,
        descripcion: String(i.descripcionProducto ?? ''),
        extra: {
          codigoActividad: i.codigoActividad,
          codigoProducto: i.codigoProducto,
          nandina: i.nandina ?? [],
        },
      })),
  },
  MENSAJES: { operacion: 'sincronizarListaMensajesServicios', extraer: parametrica },
  EVENTOS: { operacion: 'sincronizarParametricaEventosSignificativos', extraer: parametrica },
  MOTIVO_ANULACION: { operacion: 'sincronizarParametricaMotivoAnulacion', extraer: parametrica },
  PAIS: { operacion: 'sincronizarParametricaPaisOrigen', extraer: parametrica },
  TIPO_DOC_IDENTIDAD: {
    operacion: 'sincronizarParametricaTipoDocumentoIdentidad',
    extraer: parametrica,
  },
  TIPO_DOC_SECTOR: { operacion: 'sincronizarParametricaTipoDocumentoSector', extraer: parametrica },
  TIPO_EMISION: { operacion: 'sincronizarParametricaTipoEmision', extraer: parametrica },
  TIPO_HABITACION: { operacion: 'sincronizarParametricaTipoHabitacion', extraer: parametrica },
  METODO_PAGO: { operacion: 'sincronizarParametricaTipoMetodoPago', extraer: parametrica },
  MONEDA: { operacion: 'sincronizarParametricaTipoMoneda', extraer: parametrica },
  TIPO_PUNTO_VENTA: { operacion: 'sincronizarParametricaTipoPuntoVenta', extraer: parametrica },
  TIPOS_FACTURA: { operacion: 'sincronizarParametricaTiposFactura', extraer: parametrica },
  UNIDAD_MEDIDA: { operacion: 'sincronizarParametricaUnidadMedida', extraer: parametrica },
};

export type CodigoCatalogoSin = keyof typeof CATALOGOS_SIN;

/**
 * Sincroniza los catálogos del SIN en `siat_catalog_item`. Un catálogo se reemplaza entero dentro
 * de una transacción: lo que el SIN dejó de publicar desaparece, lo nuevo entra. Los del emulador
 * vienen marcados `simulated` y se sustituyen al conectarse al piloto.
 */
@Injectable()
export class SiatCatalogSyncService {
  constructor(
    private readonly gateway: SiatGatewayService,
    private readonly credentials: SiatCredentialsService,
    @InjectModel(SiatCatalogItemModel) private readonly itemModel: typeof SiatCatalogItemModel,
    @InjectModel(SiatCatalogSyncRunModel)
    private readonly runModel: typeof SiatCatalogSyncRunModel,
    private readonly sequelize: Sequelize,
  ) {}

  async sincronizar(perfil: SiatIssuerProfileModel, soloCatalogo?: CodigoCatalogoSin) {
    const run = await this.runModel.create({ issuerProfileId: perfil.id, mode: this.gateway.modo });
    const cuis = await this.credentials.cuisVigente(perfil);
    const resumen: Record<string, number> = {};
    try {
      const codigos = soloCatalogo
        ? [soloCatalogo]
        : (Object.keys(CATALOGOS_SIN) as CodigoCatalogoSin[]);
      for (const codigo of codigos) {
        const { operacion, extraer } = CATALOGOS_SIN[codigo]!;
        const { respuesta } = await this.gateway.llamarOperador(
          perfil.id,
          sincronizacion(operacion),
          {
            ...this.gateway.solicitudBase(perfil),
            cuis: cuis.codigo,
          },
        );
        if (respuesta.transaccion === false) throw rechazoDelSin(operacion, respuesta.mensajesList);
        const filas = extraer(respuesta);
        await this.reemplazar(codigo, filas, respuesta.catalogoDePrueba === true);
        resumen[codigo] = filas.length;
      }
      await run.update({ finishedAt: new Date(), catalogs: resumen, ok: true });
      return { runId: run.id, catalogos: resumen };
    } catch (error) {
      await run.update({
        finishedAt: new Date(),
        catalogs: resumen,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async reemplazar(catalogCode: string, filas: FilaCatalogo[], simulated: boolean) {
    const unicas = [...new Map(filas.map((fila) => [fila.codigo, fila])).values()];
    await this.sequelize.transaction(async (transaction) => {
      await this.itemModel.destroy({
        where: { catalogCode, codigo: { [Op.notIn]: unicas.map((f) => f.codigo).concat(['']) } },
        transaction,
      });
      if (unicas.length === 0) return;
      await this.itemModel.bulkCreate(
        unicas.map((fila) => ({ catalogCode, ...fila, simulated, syncedAt: new Date() })),
        {
          transaction,
          updateOnDuplicate: ['descripcion', 'extra', 'simulated', 'syncedAt'],
          conflictAttributes: ['catalogCode', 'codigo'],
        },
      );
    });
  }

  listar(catalogCode: string) {
    return this.itemModel.findAll({ where: { catalogCode }, order: [['codigo', 'ASC']] });
  }

  /** ¿Existe este código en el catálogo sincronizado? Base de las validaciones de F3/F5. */
  async existe(catalogCode: string, codigo: string): Promise<boolean> {
    return (await this.itemModel.count({ where: { catalogCode, codigo } })) > 0;
  }
}
