import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';
import { LegalEntityAccessService } from '../../../../common/services/legal-entity-access.service';
import { AuthUser } from '../../../../common/types/auth-context.types';
import {
  ElectronicTaxDocumentModel,
  LegalEntityModel,
  SiatIssuerProfileModel,
} from '../../../../database/models';
import { AccountingDocumentsService } from '../../../accounting/documents/services/accounting-documents.service';
import { fechaDe, fechaHoraLocal } from '../domain/fecha-local';
import { CODIGO_ESTADO } from '../domain/siat-codes';
import { OPERACIONES, SiatTransportError } from '../infrastructure/siat-transport';
import { SiatCatalogSyncService } from './siat-catalog-sync.service';
import { SiatCredentialsService } from './siat-credentials.service';
import { rechazoDelSin, sinNoDisponible } from './siat-errors';
import { SiatGatewayService } from './siat-gateway.service';

/** Motivos que el SIN admite si todavía no se sincronizó el catálogo (a confirmar en F7). */
const MOTIVOS_POR_DEFECTO = ['1', '2', '3', '4'];

/** Hasta el día 9 del mes siguiente a la emisión, en hora local del emisor. */
export function dentroDelPlazoDeAnulacion(fechaEmision: string, hoyLocal: string): boolean {
  const [anio, mes] = fechaEmision.slice(0, 7).split('-').map(Number) as [number, number];
  const limite =
    mes === 12 ? `${anio + 1}-01-09` : `${anio}-${String(mes + 1).padStart(2, '0')}-09`;
  return hoyLocal <= limite;
}

/**
 * Anulación ante el SIN, en tres tiempos (plan §2.4):
 *
 * (a) precondiciones locales —estado, plazo, cero cobros aplicados—, SIN tocar nada;
 * (b) `anulacionFactura(cuf, codigoMotivo)`;
 * (c) sólo con 905: documento `VOIDED`, factura anulada (comercio `CANCELLED` y sus cargos
 *     liberados para volver a facturarse; AR `VOID`) y su asiento revertido si estaba contabilizado.
 *
 * 936 (ya anulada) se adopta como `VOIDED`; los demás rechazos se devuelven sin cambios locales.
 * La reversión de la anulación (907) está BLOQUEADA en el MVP.
 */
@Injectable()
export class SiatAnnulmentService {
  constructor(
    private readonly gateway: SiatGatewayService,
    private readonly credentials: SiatCredentialsService,
    private readonly catalogs: SiatCatalogSyncService,
    private readonly access: LegalEntityAccessService,
    private readonly accountingDocuments: AccountingDocumentsService,
    @InjectModel(ElectronicTaxDocumentModel)
    private readonly documentModel: typeof ElectronicTaxDocumentModel,
    @InjectModel(SiatIssuerProfileModel)
    private readonly profileModel: typeof SiatIssuerProfileModel,
    @InjectModel(LegalEntityModel) private readonly legalEntityModel: typeof LegalEntityModel,
    private readonly sequelize: Sequelize,
    private readonly logger: PinoLoggerService,
  ) {}

  async anular(documentId: string, codigoMotivo: number, user: AuthUser) {
    const documento = await this.documentModel.findByPk(documentId);
    const perfil = documento?.issuerProfileId
      ? await this.profileModel.findByPk(documento.issuerProfileId)
      : null;
    if (!documento || !perfil || !this.access.canAccessLegalEntity(user, perfil.legalEntityId)) {
      throw new NotFoundException({
        code: 'FISCAL_DOCUMENT_NOT_FOUND',
        message: 'No existe ese documento fiscal o no tienes acceso a su entidad legal.',
      });
    }
    // (a) Precondiciones.
    if (!['ACCEPTED', 'OBSERVED'].includes(documento.siatStatus)) {
      throw new ConflictException({
        code: 'FISCAL_ANNUL_WRONG_STATUS',
        message: `Sólo se anula ante Impuestos una factura validada u observada; esta está en ${documento.siatStatus}.`,
      });
    }
    const motivoValido =
      (await this.catalogs.existe('MOTIVO_ANULACION', String(codigoMotivo))) ||
      ((await this.catalogs.listar('MOTIVO_ANULACION')).length === 0 &&
        MOTIVOS_POR_DEFECTO.includes(String(codigoMotivo)));
    if (!motivoValido) {
      throw new ConflictException({
        code: 'FISCAL_ANNUL_INVALID_REASON',
        message: 'Ese motivo de anulación no está en el catálogo del SIN.',
      });
    }
    const zona =
      (await this.legalEntityModel.findByPk(perfil.legalEntityId))?.timezone ?? 'America/La_Paz';
    const hoy = fechaDe(fechaHoraLocal(new Date(), zona));
    if (!dentroDelPlazoDeAnulacion(documento.fechaEmision ?? hoy, hoy)) {
      throw new ConflictException({
        code: 'FISCAL_ANNUL_OUT_OF_TERM',
        message:
          'El plazo para anular esta factura venció el día 9 del mes siguiente a su emisión.',
      });
    }
    await this.exigirSinCobros(documento);

    // (b) El SIN.
    const cuis = await this.credentials.cuisVigente(perfil);
    const cufd = await this.credentials.cufdVigente(perfil);
    let respuesta;
    try {
      ({ respuesta } = await this.gateway.llamar(perfil.id, OPERACIONES.anulacionFactura, {
        ...this.gateway.solicitudBase(perfil),
        codigoDocumentoSector: documento.codigoDocumentoSector,
        codigoEmision: 1,
        tipoFacturaDocumento: documento.tipoFacturaDocumento,
        cuis: cuis.codigo,
        cufd: cufd.codigo,
        cuf: documento.cuf,
        codigoMotivo,
      }));
    } catch (error) {
      if (error instanceof SiatTransportError)
        throw sinNoDisponible('anulacionFactura', error.message);
      throw error;
    }
    const yaAnulada = (respuesta.mensajesList ?? []).some((m) => m.codigo === 936);
    if (respuesta.codigoEstado !== CODIGO_ESTADO.ANULACION_CONFIRMADA && !yaAnulada) {
      throw rechazoDelSin('anulacionFactura', respuesta.mensajesList);
    }

    // (c) Efectos locales.
    const asiento = await this.sequelize.transaction(async (transaction) => {
      await documento.update(
        {
          siatStatus: 'VOIDED',
          codigoEstadoSin: CODIGO_ESTADO.ANULACION_CONFIRMADA,
          annulmentMotivo: codigoMotivo,
          annulledAt: new Date(),
          mensajes: respuesta.mensajesList ?? [],
        },
        { transaction },
      );
      if (documento.sourceType === 'MERCHANT_INVOICE') {
        const [factura] = await this.sequelize.query<{ accounting_document_id: string | null }>(
          `UPDATE atlas_sales.merchant_invoices SET status = 'CANCELLED'
            WHERE id = $1 RETURNING accounting_document_id`,
          { bind: [documento.sourceId], type: QueryTypes.SELECT, transaction },
        );
        await this.sequelize.query(
          'UPDATE atlas_sales.merchant_receivables SET invoice_id = NULL WHERE invoice_id = $1',
          { bind: [documento.sourceId], transaction },
        );
        return factura?.accounting_document_id ?? null;
      }
      if (documento.sourceType === 'AR_INVOICE') {
        const [factura] = await this.sequelize.query<{ accounting_document_id: string | null }>(
          `UPDATE atlas_accounting.ar_invoice SET status = 'VOID'
            WHERE id = $1 RETURNING accounting_document_id`,
          { bind: [documento.sourceId], type: QueryTypes.SELECT, transaction },
        );
        return factura?.accounting_document_id ?? null;
      }
      return null;
    });

    const contabilidad = await this.revertirAsiento(asiento, hoy, user, documento.id);
    return { id: documento.id, siatStatus: 'VOIDED', contabilidad };
  }

  private async exigirSinCobros(documento: ElectronicTaxDocumentModel) {
    const sql =
      documento.sourceType === 'MERCHANT_INVOICE'
        ? `SELECT count(*)::int AS n FROM atlas_sales.merchant_payment_allocations a
             JOIN atlas_sales.merchant_receivables r ON r.id = a.receivable_id
            WHERE r.invoice_id = $1`
        : documento.sourceType === 'AR_INVOICE'
          ? 'SELECT count(*)::int AS n FROM atlas_accounting.receipt_allocation WHERE ar_invoice_id = $1'
          : null;
    if (!sql) return;
    const [fila] = await this.sequelize.query<{ n: number }>(sql, {
      bind: [documento.sourceId],
      type: QueryTypes.SELECT,
    });
    if ((fila?.n ?? 0) > 0) {
      throw new ConflictException({
        code: 'FISCAL_ANNUL_HAS_PAYMENTS',
        message:
          'La factura tiene cobros aplicados: primero hay que desaplicarlos para poder anularla.',
      });
    }
  }

  /** Borrador → se anula; contabilizado → reverso. Si falla, la anulación fiscal ya está hecha: alerta. */
  private async revertirAsiento(
    accountingDocumentId: string | null,
    hoy: string,
    user: AuthUser,
    documentId: string,
  ): Promise<string> {
    if (!accountingDocumentId) return 'SIN_ASIENTO';
    const [doc] = await this.sequelize.query<{ status: string }>(
      'SELECT status FROM atlas_accounting.accounting_document WHERE id = $1',
      { bind: [accountingDocumentId], type: QueryTypes.SELECT },
    );
    try {
      if (doc?.status === 'DRAFT') {
        await this.sequelize.query(
          "UPDATE atlas_accounting.accounting_document SET status = 'VOID' WHERE id = $1 AND status = 'DRAFT'",
          { bind: [accountingDocumentId] },
        );
        return 'BORRADOR_ANULADO';
      }
      if (doc?.status === 'POSTED') {
        await this.accountingDocuments.reverseDocument(
          accountingDocumentId,
          {
            reversalDate: new Date(`${hoy}T12:00:00Z`),
            reason: 'Factura anulada ante Impuestos Nacionales (SIAT).',
          },
          user,
        );
        return 'REVERTIDO';
      }
      return `SIN_CAMBIOS_${doc?.status ?? 'DESCONOCIDO'}`;
    } catch (error) {
      this.logger.warn('Factura anulada ante el SIN pero su asiento no se pudo revertir.', {
        layer: 'service',
        module: 'fiscal-siat',
        alert: 'SIAT_ANNUL_ACCOUNTING_PENDING',
        documentId,
        accountingDocumentId,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'REVERSO_PENDIENTE';
    }
  }
}
