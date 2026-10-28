import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ArInvoiceLineModel, ArInvoiceModel } from '../../../../database/models';
import { AuthUser } from '../../../../common/types/auth-context.types';
import { LegalEntityAccessService } from '../../../../common/services/legal-entity-access.service';
import { BusinessActionLogsService } from '../../../business-action-logs/business-action-logs.service';
import { invoiceDeletionBlockers, pickEditableInvoiceFields } from '../domain/ar-invoice';
import { assertInvoicePatchAllowed } from '../../shared/domain/posted-document-patch';

/** Editar los campos permitidos de una factura AR y borrar la que no dejó rastro contable. */
@Injectable()
export class ArInvoiceMaintenanceService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly legalEntityAccessService: LegalEntityAccessService,
    private readonly businessActionLogsService: BusinessActionLogsService,
    @InjectModel(ArInvoiceModel) private readonly arInvoiceModel: typeof ArInvoiceModel,
    @InjectModel(ArInvoiceLineModel) private readonly arInvoiceLineModel: typeof ArInvoiceLineModel,
  ) {}

  async updateInvoice(id: string, input: Record<string, unknown>, user: AuthUser) {
    const row = await this.findAccessibleInvoice(id, user);
    const changes = pickEditableInvoiceFields(input);
    assertInvoicePatchAllowed(row, changes);
    await row.update(changes);
    return row;
  }

  /**
   * Sólo se borra una factura que no dejó rastro contable: en borrador, sin asiento, sin cobros y
   * sin documento fiscal. Antes se borraba cualquiera: el asiento publicado seguía en el mayor, los
   * recibos quedaban aplicados a una factura inexistente y nada se recalculaba. Una factura
   * contabilizada no se borra: se anula (ante Impuestos, si tiene documento fiscal) o se reversa su
   * asiento (`POST /accounting/documents/:id/reverse`).
   */
  async deleteInvoice(id: string, user: AuthUser) {
    const row = await this.findAccessibleInvoice(id, user);
    return this.sequelize.transaction(async (transaction) => {
      const [trace] = await this.sequelize.query<{ cobros: string; fiscal: string }>(
        `SELECT
           (SELECT count(*) FROM atlas_accounting.receipt_allocation WHERE ar_invoice_id = :id)::text AS cobros,
           (SELECT count(*) FROM atlas_accounting.electronic_tax_document WHERE ar_invoice_id = :id)::text AS fiscal`,
        { replacements: { id }, type: QueryTypes.SELECT, transaction },
      );
      const blockers = invoiceDeletionBlockers(row, {
        receiptAllocations: Number(trace?.cobros ?? 0),
        fiscalDocuments: Number(trace?.fiscal ?? 0),
      });
      if (blockers.length > 0) {
        throw new ConflictException({
          code: 'AR_INVOICE_HAS_ACCOUNTING_TRACE',
          message:
            'Una factura contabilizada no se borra: se anula (ante Impuestos, si tiene documento fiscal) o se reversa su asiento.',
          details: { reasons: blockers, accountingDocumentId: row.accountingDocumentId ?? null },
        });
      }
      await this.arInvoiceLineModel.destroy({ where: { arInvoiceId: id }, transaction });
      await row.destroy({ transaction });
      await this.businessActionLogsService.record({
        moduleCode: 'ACCOUNTING',
        businessProcess: 'ACCOUNTS_RECEIVABLE',
        actionCode: 'DELETE_DRAFT_AR_INVOICE',
        actorUserId: user.sub,
        actorRole: user.role ?? null,
        aggregateType: 'AR_INVOICE',
        aggregateId: id,
        affectedTables: ['atlas_accounting.ar_invoice', 'atlas_accounting.ar_invoice_line'],
        affectedRecordCount: 1,
        status: 'SUCCESS',
        inputSummary: { invoiceNo: row.invoiceNo, legalEntityId: row.legalEntityId },
        transaction,
      });
      return { id, deleted: true };
    });
  }

  private async findAccessibleInvoice(id: string, user: AuthUser): Promise<ArInvoiceModel> {
    const row = await this.arInvoiceModel.findByPk(id);
    if (!row)
      throw new NotFoundException({
        code: 'AR_INVOICE_NOT_FOUND',
        message: 'La factura no existe.',
      });
    this.legalEntityAccessService.assertCanAccessLegalEntity(user, row.legalEntityId);
    return row;
  }
}
