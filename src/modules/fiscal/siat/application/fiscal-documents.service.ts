import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { gunzipSync } from 'node:zlib';
import { Op, WhereOptions } from 'sequelize';
import { LegalEntityAccessService } from '../../../../common/services/legal-entity-access.service';
import { AuthUser } from '../../../../common/types/auth-context.types';
import {
  ElectronicTaxDocumentModel,
  SiatIssuerProfileModel,
  SiatPackageModel,
  SiatSignificantEventModel,
} from '../../../../database/models';
import type { ListFiscalDocumentsQuery } from '../fiscal-siat.schemas';
import { FiscalMailService } from './fiscal-mail.service';

const COLUMNAS_LISTADO = [
  'id',
  'sourceType',
  'sourceId',
  'numeroFactura',
  'cuf',
  'siatStatus',
  'codigoEstadoSin',
  'codigoEmision',
  'fechaEmision',
  'montoTotal',
  'receptorSnapshot',
  'attemptCount',
  'lastError',
  'eventId',
  'packageId',
  'annulledAt',
  'createdAt',
  'updatedAt',
  'issuerProfileId',
  'mensajes',
] as const;

/** Lectura de documentos fiscales, acotada por entidad legal (vía el perfil emisor). */
@Injectable()
export class FiscalDocumentsService {
  constructor(
    @InjectModel(ElectronicTaxDocumentModel)
    private readonly documentModel: typeof ElectronicTaxDocumentModel,
    @InjectModel(SiatIssuerProfileModel)
    private readonly profileModel: typeof SiatIssuerProfileModel,
    @InjectModel(SiatSignificantEventModel)
    private readonly eventModel: typeof SiatSignificantEventModel,
    @InjectModel(SiatPackageModel) private readonly packageModel: typeof SiatPackageModel,
    private readonly access: LegalEntityAccessService,
    private readonly mail: FiscalMailService,
  ) {}

  private async perfilesVisibles(user: AuthUser): Promise<string[] | null> {
    const allowed = this.access.accessibleLegalEntityIds(user);
    if (allowed === null) return null;
    const perfiles = await this.profileModel.findAll({
      attributes: ['id'],
      where: { legalEntityId: { [Op.in]: [...allowed] } },
    });
    return perfiles.map((p) => p.id);
  }

  async listar(query: ListFiscalDocumentsQuery, user: AuthUser) {
    const perfiles = await this.perfilesVisibles(user);
    const where: Record<string, unknown> = {};
    if (perfiles !== null) where.issuerProfileId = { [Op.in]: perfiles };
    if (query.status) where.siatStatus = query.status;
    if (query.sourceType) where.sourceType = query.sourceType;
    if (query.sourceId) where.sourceId = query.sourceId;
    const pageSize = query.pageSize ?? 100;
    const { rows, count } = await this.documentModel.findAndCountAll({
      attributes: [...COLUMNAS_LISTADO],
      where: where as WhereOptions,
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset: ((query.page ?? 1) - 1) * pageSize,
    });
    return { items: rows, total: count, page: query.page ?? 1, pageSize };
  }

  async obtener(id: string, user: AuthUser): Promise<ElectronicTaxDocumentModel> {
    const documento = await this.documentModel.findByPk(id);
    const perfil = documento?.issuerProfileId
      ? await this.profileModel.findByPk(documento.issuerProfileId, {
          attributes: ['legalEntityId'],
        })
      : null;
    if (!documento || !perfil || !this.access.canAccessLegalEntity(user, perfil.legalEntityId)) {
      throw new NotFoundException({
        code: 'FISCAL_DOCUMENT_NOT_FOUND',
        message: 'No existe ese documento fiscal o no tienes acceso a su entidad legal.',
      });
    }
    return documento;
  }

  async detalle(id: string, user: AuthUser) {
    const documento = await this.obtener(id, user);
    const { xmlGzip: _xml, ...resto } = documento.toJSON() as Record<string, unknown>;
    // Qué se le mandó al comprador y cuándo: el SIN exige entregarle la factura y el XML.
    return { ...resto, correos: await this.mail.listar(documento.id) };
  }

  /** El XML tal como se envió al SIN (lo que el comprador tiene derecho a recibir). */
  async xml(id: string, user: AuthUser): Promise<{ xml: Buffer; filename: string }> {
    const documento = await this.obtener(id, user);
    if (!documento.xmlGzip) {
      throw new NotFoundException({
        code: 'FISCAL_DOCUMENT_WITHOUT_XML',
        message: 'Este documento fiscal no tiene XML (registro anterior a la integración).',
      });
    }
    return {
      xml: gunzipSync(documento.xmlGzip),
      filename: `factura-${documento.numeroFactura ?? documento.id}.xml`,
    };
  }

  async eventos(user: AuthUser) {
    const perfiles = await this.perfilesVisibles(user);
    const eventos = await this.eventModel.findAll({
      where: (perfiles === null ? {} : { issuerProfileId: { [Op.in]: perfiles } }) as WhereOptions,
      order: [['inicio', 'DESC']],
      limit: 100,
    });
    const paquetes = await this.packageModel.findAll({
      where: { eventId: { [Op.in]: eventos.map((e) => e.id) } },
    });
    return eventos.map((evento) => ({
      ...evento.toJSON(),
      paquetes: paquetes.filter((p) => p.eventId === evento.id),
    }));
  }
}
