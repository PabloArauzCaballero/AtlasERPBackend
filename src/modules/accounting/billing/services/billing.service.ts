import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  ArInvoiceLineModel,
  ArInvoiceModel,
  BillingEventModel,
  ContractHeaderModel,
  ElectronicTaxDocumentModel,
} from '../../../../database/models';
import { AuthUser } from '../../../../common/types/auth-context.types';
import {
  CreateAccountingDocumentDto,
  CreateBillingEventDto,
  IssueArInvoiceDto,
} from '../../shared/schemas/accounting.schemas';
import { AccountingDocumentsService } from '../../documents/services/accounting-documents.service';
import { LegalEntityAccessService } from '../../../../common/services/legal-entity-access.service';
import { BusinessPartnerRoleValidationService } from '../../business-partners/services/business-partner-role-validation.service';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

/**
 * Gestiona eventos facturables y emisión AR manteniendo separadas factura comercial,
 * documento fiscal electrónico y documento contable.
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly accountingDocumentsService: AccountingDocumentsService,
    private readonly businessPartnerRoleValidationService: BusinessPartnerRoleValidationService,
    private readonly legalEntityAccessService: LegalEntityAccessService,
    private readonly logger: PinoLoggerService,
    @InjectModel(BillingEventModel) private readonly billingEventModel: typeof BillingEventModel,
    @InjectModel(ArInvoiceModel) private readonly arInvoiceModel: typeof ArInvoiceModel,
    @InjectModel(ArInvoiceLineModel) private readonly arInvoiceLineModel: typeof ArInvoiceLineModel,
    @InjectModel(ContractHeaderModel)
    private readonly contractHeaderModel: typeof ContractHeaderModel,
    @InjectModel(ElectronicTaxDocumentModel)
    private readonly electronicTaxDocumentModel: typeof ElectronicTaxDocumentModel,
  ) {}

  /** Listado de eventos de facturación (para poblar el select del frontend). */
  listEvents() {
    return this.billingEventModel.findAll({ order: [['eventTime', 'DESC']], limit: 200 });
  }

  async listInvoices(user: AuthUser) {
    const rows = await this.arInvoiceModel.findAll({ order: [['createdAt', 'DESC']] });
    const items = rows.filter((row) => {
      try {
        this.legalEntityAccessService.assertCanAccessLegalEntity(user, row.legalEntityId);
        return true;
      } catch {
        return false;
      }
    });
    return { items, total: items.length };
  }

  async updateInvoice(id: string, input: Record<string, unknown>, user: AuthUser) {
    const row = await this.arInvoiceModel.findByPk(id);
    if (!row)
      throw new NotFoundException({
        code: 'AR_INVOICE_NOT_FOUND',
        message: 'La factura no existe.',
      });
    this.legalEntityAccessService.assertCanAccessLegalEntity(user, row.legalEntityId);
    const allowed = ['invoiceNo', 'invoiceDate', 'dueDate', 'status'];
    await row.update(
      Object.fromEntries(Object.entries(input).filter(([key]) => allowed.includes(key))),
    );
    return row;
  }

  async deleteInvoice(id: string, user: AuthUser) {
    const row = await this.arInvoiceModel.findByPk(id);
    if (!row)
      throw new NotFoundException({
        code: 'AR_INVOICE_NOT_FOUND',
        message: 'La factura no existe.',
      });
    this.legalEntityAccessService.assertCanAccessLegalEntity(user, row.legalEntityId);
    await row.destroy();
    return { id, deleted: true };
  }

  createBillingEvent(input: CreateBillingEventDto, user: AuthUser) {
    this.logger.info('Registrando evento facturable.', {
      layer: 'service',
      module: 'billing',
      action: 'createBillingEvent',
      contractId: input.contractId,
      eventType: input.eventType,
      externalRef: input.externalRef,
      userId: user.sub,
    });
    return this.sequelize.transaction(async (transaction) => {
      const contract = await this.contractHeaderModel.findByPk(input.contractId, { transaction });
      if (!contract) {
        throw new NotFoundException({
          code: 'CONTRACT_NOT_FOUND',
          message: 'El contrato asociado al evento facturable no existe.',
        });
      }
      this.legalEntityAccessService.assertCanAccessLegalEntity(user, contract.legalEntityId);
      const event = await this.billingEventModel.create(
        { ...input, status: 'RECORDED' },
        { transaction },
      );
      this.logger.info('Evento facturable registrado.', {
        layer: 'service',
        module: 'billing',
        action: 'createBillingEvent',
        billingEventId: event.id,
        contractId: input.contractId,
      });
      return event;
    });
  }

  issueInvoice(input: IssueArInvoiceDto, user: AuthUser) {
    this.logger.info('Emitiendo factura AR.', {
      layer: 'service',
      module: 'billing',
      action: 'issueInvoice',
      invoiceNo: input.invoiceNo,
      legalEntityId: input.legalEntityId,
      customerBpId: input.customerBpId,
      userId: user.sub,
    });
    return this.sequelize.transaction(async (transaction) => {
      this.legalEntityAccessService.assertCanAccessLegalEntity(user, input.legalEntityId);
      await this.assertInvoiceInputsAreSapSafe(input, transaction);
      const grossAmount = Number(input.netAmount) + Number(input.taxAmount);

      const invoice = await this.arInvoiceModel.create(
        {
          legalEntityId: input.legalEntityId,
          customerBpId: input.customerBpId,
          contractId: input.contractId,
          invoiceNo: input.invoiceNo,
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

      if (input.electronicTaxDocument) {
        await this.electronicTaxDocumentModel.create(
          {
            arInvoiceId: invoice.id,
            cuf: input.electronicTaxDocument.cuf,
            cufd: input.electronicTaxDocument.cufd,
            siatStatus: input.electronicTaxDocument.siatStatus,
            xmlHash: input.electronicTaxDocument.xmlHash,
            graphicRepresentationUrl: input.electronicTaxDocument.graphicRepresentationUrl,
            contingencyFlag: input.electronicTaxDocument.contingencyFlag,
            emittedAt: input.electronicTaxDocument.emittedAt,
          },
          { transaction },
        );
      }

      const journalLines = this.buildInvoiceJournalLines(input, grossAmount, invoice.id);
      const accounting = await this.accountingDocumentsService.createDraftInTransaction(
        {
          legalEntityId: input.legalEntityId,
          sourceSystem: 'BILLING',
          sourceType: 'AR_INVOICE',
          sourceId: invoice.id,
          documentType: 'AR_INVOICE',
          documentNo: `AR-${input.invoiceNo}`,
          documentDate: input.invoiceDate,
          postingDate: input.invoiceDate,
          accountingPeriodId: input.accountingPeriodId,
          ledgerId: input.ledgerId,
          currencyCode: input.currencyCode,
          approvalStatus: 'NOT_REQUIRED',
          lines: journalLines,
        },
        user,
        transaction,
      );

      await this.accountingDocumentsService.postDocumentInTransaction(
        accounting.document.id,
        user,
        transaction,
      );
      await invoice.update({ accountingDocumentId: accounting.document.id }, { transaction });

      this.logger.info('Factura AR emitida y contabilizada.', {
        layer: 'service',
        module: 'billing',
        action: 'issueInvoice',
        invoiceId: invoice.id,
        invoiceNo: invoice.invoiceNo,
        accountingDocumentId: accounting.document.id,
      });
      return { invoice, accountingDocumentId: accounting.document.id };
    });
  }

  private async assertInvoiceInputsAreSapSafe(
    input: IssueArInvoiceDto,
    transaction: Transaction,
  ): Promise<void> {
    this.logger.debug('Validando factura AR con reglas SAP-like.', {
      layer: 'service',
      module: 'billing',
      action: 'assertInvoiceInputsAreSapSafe',
      invoiceNo: input.invoiceNo,
      legalEntityId: input.legalEntityId,
    });
    await this.businessPartnerRoleValidationService.assertHasAnyActiveRole(
      input.customerBpId,
      ['CUSTOMER', 'MERCHANT', 'INTERCOMPANY'],
      input.legalEntityId,
      transaction,
    );

    if (input.contractId) {
      const contract = await this.contractHeaderModel.findByPk(input.contractId, { transaction });
      if (!contract) {
        throw new NotFoundException({
          code: 'CONTRACT_NOT_FOUND',
          message: 'El contrato asociado a la factura no existe.',
        });
      }

      if (
        contract.legalEntityId !== input.legalEntityId ||
        contract.counterpartyBpId !== input.customerBpId
      ) {
        throw new ConflictException({
          code: 'INVOICE_CONTRACT_MISMATCH',
          message: 'El contrato no corresponde a la entidad legal o contraparte de la factura.',
        });
      }

      if (!['ACTIVE', 'APPROVED'].includes(contract.status)) {
        throw new ConflictException({
          code: 'CONTRACT_NOT_ACTIVE',
          message: 'El contrato no está activo o aprobado para facturación.',
        });
      }
    }

    if (Number(input.taxAmount) > 0 && (!input.taxLiabilityAccountId || !input.taxCodeId)) {
      throw new BadRequestException({
        code: 'TAX_ACCOUNT_AND_CODE_REQUIRED',
        message: 'Una factura con impuesto debe informar cuenta fiscal pasiva y código tributario.',
      });
    }

    if (Number(input.taxAmount) === 0 && input.taxLiabilityAccountId) {
      throw new BadRequestException({
        code: 'TAX_ACCOUNT_WITHOUT_TAX_AMOUNT',
        message: 'No informes cuenta fiscal si la factura no tiene impuesto.',
      });
    }

    if (input.electronicTaxDocument?.siatStatus === 'ACCEPTED') {
      const taxDocument = input.electronicTaxDocument;
      if (!taxDocument.cuf || !taxDocument.cufd || !taxDocument.xmlHash || !taxDocument.emittedAt) {
        throw new BadRequestException({
          code: 'ACCEPTED_EINVOICE_REQUIRES_TRACEABILITY',
          message:
            'Un documento fiscal aceptado por SIAT requiere CUF, CUFD, hash XML y fecha de emisión.',
        });
      }
    }
  }

  private buildInvoiceJournalLines(
    input: IssueArInvoiceDto,
    grossAmount: number,
    invoiceId: string,
  ): CreateAccountingDocumentDto['lines'] {
    this.logger.debug('Construyendo líneas contables de factura AR.', {
      layer: 'service',
      module: 'billing',
      action: 'buildInvoiceJournalLines',
      invoiceNo: input.invoiceNo,
      grossAmount,
    });
    const journalLines: CreateAccountingDocumentDto['lines'] = [
      {
        glAccountId: input.arAccountId,
        debit: grossAmount,
        credit: 0,
        currencyCode: input.currencyCode,
        amountLc: grossAmount,
        partnerId: input.customerBpId,
        referenceType: 'AR_INVOICE',
        referenceId: invoiceId,
        description: `CxC factura ${input.invoiceNo}`,
      },
      {
        glAccountId: input.revenueAccountId,
        debit: 0,
        credit: Number(input.netAmount),
        currencyCode: input.currencyCode,
        amountLc: Number(input.netAmount),
        partnerId: input.customerBpId,
        taxCodeId: input.taxCodeId,
        referenceType: 'AR_INVOICE',
        referenceId: invoiceId,
        description: input.description,
      },
    ];

    if (Number(input.taxAmount) > 0 && input.taxLiabilityAccountId) {
      journalLines.push({
        glAccountId: input.taxLiabilityAccountId,
        debit: 0,
        credit: Number(input.taxAmount),
        currencyCode: input.currencyCode,
        amountLc: Number(input.taxAmount),
        partnerId: input.customerBpId,
        taxCodeId: input.taxCodeId,
        referenceType: 'AR_INVOICE',
        referenceId: invoiceId,
        description: `IVA débito factura ${input.invoiceNo}`,
      });
    }

    return journalLines;
  }
}
