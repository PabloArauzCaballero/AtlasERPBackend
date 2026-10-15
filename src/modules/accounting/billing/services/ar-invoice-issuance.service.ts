import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ArInvoiceLineModel, ArInvoiceModel } from '../../../../database/models';
import { AuthUser } from '../../../../common/types/auth-context.types';
import { IssueArInvoiceDto } from '../../shared/schemas/accounting.schemas';
import { AccountingDraftService } from '../../documents/services/accounting-draft.service';
import { AccountingPostingService } from '../../documents/services/accounting-posting.service';
import { LegalEntityAccessService } from '../../../../common/services/legal-entity-access.service';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';
import { nextDocumentNumber } from '../../../../common/numbering/document-numbering';
import { BusinessActionLogsService } from '../../../business-action-logs/business-action-logs.service';
import {
  assertFiscalStatusNotClientAsserted,
  buildInvoiceJournalLines,
} from '../domain/ar-invoice';
import { ArInvoiceFiscalEmission } from './ar-invoice-fiscal-emission.service';
import { ArInvoicePreparation } from './ar-invoice-preparation.service';

/**
 * Emisión de una factura AR manteniendo separadas factura comercial, documento fiscal electrónico y
 * documento contable: los tres nacen y se confirman en la misma transacción.
 */
@Injectable()
export class ArInvoiceIssuanceService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly drafts: AccountingDraftService,
    private readonly posting: AccountingPostingService,
    private readonly preparation: ArInvoicePreparation,
    private readonly fiscalEmission: ArInvoiceFiscalEmission,
    private readonly legalEntityAccessService: LegalEntityAccessService,
    private readonly businessActionLogsService: BusinessActionLogsService,
    private readonly logger: PinoLoggerService,
    @InjectModel(ArInvoiceModel) private readonly arInvoiceModel: typeof ArInvoiceModel,
    @InjectModel(ArInvoiceLineModel) private readonly arInvoiceLineModel: typeof ArInvoiceLineModel,
  ) {}

  async issueInvoice(rawInput: IssueArInvoiceDto, user: AuthUser) {
    assertFiscalStatusNotClientAsserted(rawInput);
    this.logger.info('Emitiendo factura AR.', {
      layer: 'service',
      module: 'billing',
      action: 'issueInvoice',
      legalEntityId: rawInput.legalEntityId,
      customerBpId: rawInput.customerBpId,
      userId: user.sub,
    });
    this.legalEntityAccessService.assertCanAccessLegalEntity(user, rawInput.legalEntityId);
    const fiscal = await this.fiscalEmission.prepare(rawInput);
    return this.sequelize.transaction(async (transaction) => {
      this.legalEntityAccessService.assertCanAccessLegalEntity(user, rawInput.legalEntityId);
      const input = await this.preparation.resolveDefaults(rawInput, transaction);
      await this.preparation.assertInputsAreSapSafe(input, transaction);
      const grossAmount = Number(input.netAmount) + Number(input.taxAmount);

      // La serie es por entidad legal, que es como la tiene declarada única la propia tabla.
      const invoiceNo = await nextDocumentNumber(
        this.sequelize,
        {
          prefix: 'FAC-AR',
          table: 'atlas_accounting.ar_invoice',
          column: 'invoice_no',
          date: input.invoiceDate,
          scope: { column: 'legal_entity_id', value: input.legalEntityId },
        },
        transaction,
      );

      const invoice = await this.arInvoiceModel.create(
        {
          legalEntityId: input.legalEntityId,
          customerBpId: input.customerBpId,
          contractId: input.contractId,
          invoiceNo,
          invoiceDate: input.invoiceDate,
          dueDate: input.dueDate,
          currencyCode: input.currencyCode,
          netAmount: input.netAmount,
          taxAmount: input.taxAmount,
          grossAmount,
          status: 'ISSUED',
        },
        { transaction },
      );

      await this.arInvoiceLineModel.create(
        {
          arInvoiceId: invoice.id,
          lineNo: 1,
          billingEventId: input.billingEventId,
          revenueAccountId: input.revenueAccountId,
          taxCodeId: input.taxCodeId,
          description: input.description,
          qty: 1,
          unitPrice: input.netAmount,
          lineAmount: input.netAmount,
        },
        { transaction },
      );

      const fiscalDocument = fiscal
        ? await this.fiscalEmission.emit(
            fiscal,
            invoice,
            input.description,
            grossAmount,
            transaction,
          )
        : null;

      const accounting = await this.drafts.createDraftInTransaction(
        {
          legalEntityId: input.legalEntityId,
          sourceSystem: 'BILLING',
          sourceType: 'AR_INVOICE',
          sourceId: invoice.id,
          documentType: 'AR_INVOICE',
          documentNo: `AR-${invoiceNo}`,
          documentDate: input.invoiceDate,
          postingDate: input.invoiceDate,
          accountingPeriodId: input.accountingPeriodId,
          ledgerId: input.ledgerId,
          currencyCode: input.currencyCode,
          lines: buildInvoiceJournalLines(input, grossAmount, invoice.id, invoiceNo),
        },
        user,
        transaction,
        { origin: 'SERVER_GENERATED' },
      );

      await this.posting.postDocumentInTransaction(accounting.document.id, user, transaction);
      await invoice.update({ accountingDocumentId: accounting.document.id }, { transaction });

      await this.businessActionLogsService.record({
        moduleCode: 'ACCOUNTING',
        businessProcess: 'ACCOUNTS_RECEIVABLE',
        actionCode: 'ISSUE_AR_INVOICE',
        actorUserId: user.sub,
        actorRole: user.role ?? null,
        aggregateType: 'AR_INVOICE',
        aggregateId: invoice.id,
        affectedTables: [
          'atlas_accounting.ar_invoice',
          'atlas_accounting.ar_invoice_line',
          'atlas_accounting.accounting_document',
        ],
        affectedRecordCount: 3,
        status: 'SUCCESS',
        inputSummary: { legalEntityId: input.legalEntityId, grossAmount: String(grossAmount) },
        outputSummary: {
          invoiceNo: invoice.invoiceNo,
          accountingDocumentId: accounting.document.id,
          fiscalDocument: fiscalDocument !== null,
        },
        transaction,
      });

      this.logger.info('Factura AR emitida y contabilizada.', {
        layer: 'service',
        module: 'billing',
        action: 'issueInvoice',
        invoiceId: invoice.id,
        invoiceNo: invoice.invoiceNo,
        accountingDocumentId: accounting.document.id,
      });
      return { invoice, accountingDocumentId: accounting.document.id, fiscalDocument };
    });
  }
}
