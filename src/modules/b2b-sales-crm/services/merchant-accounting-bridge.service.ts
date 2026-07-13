import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { B2BAccountModel, MerchantInvoiceModel } from '../models/b2b-sales-crm.models';
import { AccountingDocumentsService } from '../../accounting/documents/services/accounting-documents.service';
import type { CreateAccountingDocumentDto } from '../../accounting/shared/schemas/accounting.schemas';
import type { AuthUser } from '../../../common/types/auth-context.types';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import type { PostMerchantInvoiceToGlDto } from '../b2b-sales-crm.dtos';

/**
 * Puente facturación merchant (atlas_sales) → contabilidad (atlas_accounting).
 * Reutiliza el motor de documentos contables para generar el asiento de venta
 * (Debe CxC / Haber Ingreso / Haber IVA) a partir de una factura merchant.
 */
@Injectable()
export class MerchantAccountingBridgeService {
  constructor(
    private readonly logger: PinoLoggerService,
    private readonly accountingDocuments: AccountingDocumentsService,
    @InjectModel(MerchantInvoiceModel)
    private readonly invoiceModel: typeof MerchantInvoiceModel,
    @InjectModel(B2BAccountModel) private readonly accountModel: typeof B2BAccountModel,
  ) {}

  async postInvoiceToGl(invoiceId: string, input: PostMerchantInvoiceToGlDto, user: AuthUser) {
    const invoice = await this.invoiceModel.findByPk(invoiceId);
    if (!invoice) {
      throw new NotFoundException('Factura merchant no encontrada.');
    }
    if (invoice.accountingDocumentId) {
      throw new ConflictException({
        code: 'MERCHANT_INVOICE_ALREADY_POSTED',
        message: 'La factura ya fue posteada al mayor.',
      });
    }

    const account = await this.accountModel.findByPk(invoice.accountId);
    const partnerId = input.partnerId ?? account?.businessPartnerId ?? undefined;
    if (!partnerId) {
      throw new BadRequestException({
        code: 'MERCHANT_WITHOUT_BUSINESS_PARTNER',
        message:
          'El comercio no tiene business partner contable vinculado. Vincúlelo o envíe partnerId explícito.',
      });
    }

    const total = Number(invoice.totalAmount);
    const subtotal = Number(invoice.subtotalAmount);
    const tax = Number(invoice.taxAmount);
    const currencyCode = input.currencyCode;

    if (tax > 0 && !input.taxAccountId) {
      throw new BadRequestException({
        code: 'TAX_ACCOUNT_REQUIRED',
        message: 'La factura tiene impuesto; indique la cuenta de impuesto (taxAccountId).',
      });
    }

    const lines: CreateAccountingDocumentDto['lines'] = [
      {
        glAccountId: input.arAccountId,
        debit: total,
        credit: 0,
        currencyCode,
        amountLc: total,
        partnerId,
        referenceType: 'MERCHANT_INVOICE',
        referenceId: invoice.id,
        description: `CxC factura ${invoice.invoiceNumber}`,
      },
      {
        glAccountId: input.revenueAccountId,
        debit: 0,
        credit: subtotal,
        currencyCode,
        amountLc: subtotal,
        description: `Ingreso factura ${invoice.invoiceNumber}`,
      },
    ];
    if (tax > 0 && input.taxAccountId) {
      lines.push({
        glAccountId: input.taxAccountId,
        debit: 0,
        credit: tax,
        currencyCode,
        amountLc: tax,
        description: `IVA factura ${invoice.invoiceNumber}`,
      });
    }

    const dto: CreateAccountingDocumentDto = {
      legalEntityId: input.legalEntityId,
      sourceSystem: 'CRM',
      sourceType: 'MERCHANT_INVOICE',
      sourceId: invoice.id,
      documentType: 'AR_INVOICE',
      documentNo: `MINV-${invoice.invoiceNumber}`,
      documentDate: new Date(invoice.invoiceDate),
      postingDate: new Date(invoice.invoiceDate),
      accountingPeriodId: input.accountingPeriodId,
      ledgerId: input.ledgerId,
      currencyCode,
      approvalStatus: 'NOT_REQUIRED',
      lines,
    };

    this.logger.infoContext(MerchantAccountingBridgeService.name, 'Posteando factura merchant al mayor', {
      merchantInvoiceId: invoice.id,
      total,
    });

    const created = await this.accountingDocuments.createDraft(dto, user);
    await invoice.update({ accountingDocumentId: created.document.id });

    return {
      merchantInvoiceId: invoice.id,
      accountingDocumentId: created.document.id,
      journalId: created.journal?.id ?? null,
    };
  }
}
