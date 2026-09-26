import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { QueryTypes, type Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  B2BAccountModel,
  B2BContractModel,
  MerchantInvoiceLineModel,
  MerchantInvoiceModel,
  MerchantReceivableModel,
} from '../models/b2b-sales-crm.models';
import { InvoiceStatus } from '../b2b-sales-crm.enums';
import {
  AccountingDocumentsService,
  type AccountingDraftInput,
} from '../../accounting/documents/services/accounting-documents.service';
import { LegalEntityAccessService } from '../../../common/services/legal-entity-access.service';
import type { AuthUser } from '../../../common/types/auth-context.types';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import {
  CurrencyMismatchError,
  assertSingleCurrency,
  fromMinorUnits,
  parseMoney,
  sumMinor,
} from '../../../common/money/decimal-amount.util';
import type { PostMerchantInvoiceToGlDto } from '../b2b-sales-crm.dtos';

export const MERCHANT_INVOICE_SOURCE = {
  sourceSystem: 'CRM',
  sourceType: 'MERCHANT_INVOICE',
} as const;

/** Estados de factura que ya son un hecho facturado y por tanto se pueden llevar al mayor. */
const POSTABLE_INVOICE_STATUSES: ReadonlySet<string> = new Set([
  InvoiceStatus.ISSUED,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.PAID,
  InvoiceStatus.OVERDUE,
]);

export type MerchantInvoiceAccountingOutcome =
  'DRAFT_CREATED' | 'EXISTING_DOCUMENT_RETURNED' | 'ORPHAN_DOCUMENT_LINKED';

export interface MerchantInvoiceAccountingDraftResult {
  merchantInvoiceId: string;
  accountingDocumentId: string;
  journalId: string | null;
  /** Estado REAL del documento contable: `DRAFT` hasta que alguien lo publique. */
  accountingDocumentStatus: string;
  journalPostingStatus: string | null;
  /** `true` sólo si el asiento está PUBLICADO: un borrador nunca es saldo contabilizado. */
  postedToLedger: boolean;
  outcome: MerchantInvoiceAccountingOutcome;
  /** Qué falta para que cuente en el mayor, o `null` si ya no depende de esta factura. */
  nextStep: { action: 'POST_ACCOUNTING_DOCUMENT'; method: 'PATCH'; path: string } | null;
}

/**
 * Puente facturación de comercio (atlas_sales) → contabilidad (atlas_accounting).
 *
 * ## Qué hace y qué NO hace (P-06, 2026-09-24)
 *
 * Genera el BORRADOR del asiento de venta (Debe CxC / Haber Ingreso / Haber IVA) de una factura de
 * comercio y lo enlaza a la factura. NO publica: la publicación es el paso explícito y separado
 * `PATCH /accounting/documents/:id/post`, que es donde viven el bloqueo de fila, el período
 * abierto, la doble partida sobre lo guardado, la aprobación y el hash. Por eso la respuesta dice
 * `accountingDocumentStatus` y `postedToLedger`: un DRAFT no se reporta como saldo contabilizado.
 * La ruta conserva su nombre (`post-to-gl`) por compatibilidad con los clientes que ya la llaman.
 *
 * ## Atomicidad e idempotencia
 *
 * Todo ocurre en UNA transacción local que empieza bloqueando la fila de la factura: dos llamadas
 * simultáneas se serializan y la segunda encuentra el enlace de la primera y devuelve el mismo
 * documento. Crear el documento y enlazarlo a la factura se confirman juntos o no se confirma
 * ninguno. Un documento que un intento anterior (versión previa del puente, que escribía en dos
 * transacciones) dejó sin enlazar se RECUPERA en vez de crear otro; la base lo respalda con
 * `uq_accounting_document_merchant_invoice_origin`.
 *
 * ## Revalidación
 *
 * La factura manda: el partner es el del comercio de la factura (no uno que envíe el cliente), la
 * moneda es la de sus cargos y la de la entidad legal (sin tipo de cambio no hay importe local), el
 * impuesto de cabecera es la suma del de las líneas, y el contrato —si lo hay— es del mismo
 * comercio. Período cerrado, libro/período de otra entidad y entidad fuera del alcance del usuario
 * los rechaza el motor de documentos antes de escribir nada.
 */
@Injectable()
export class MerchantAccountingBridgeService {
  constructor(
    private readonly logger: PinoLoggerService,
    private readonly accountingDocuments: AccountingDocumentsService,
    private readonly legalEntityAccess: LegalEntityAccessService,
    @InjectConnection() private readonly sequelize: Sequelize,
    @InjectModel(MerchantInvoiceModel)
    private readonly invoiceModel: typeof MerchantInvoiceModel,
    @InjectModel(MerchantInvoiceLineModel)
    private readonly invoiceLineModel: typeof MerchantInvoiceLineModel,
    @InjectModel(MerchantReceivableModel)
    private readonly receivableModel: typeof MerchantReceivableModel,
    @InjectModel(B2BAccountModel) private readonly accountModel: typeof B2BAccountModel,
    @InjectModel(B2BContractModel) private readonly contractModel: typeof B2BContractModel,
  ) {}

  postInvoiceToGl(
    invoiceId: string,
    input: PostMerchantInvoiceToGlDto,
    user: AuthUser,
  ): Promise<MerchantInvoiceAccountingDraftResult> {
    return this.sequelize.transaction((transaction) =>
      this.createDraftForInvoice(invoiceId, input, user, transaction),
    );
  }

  private async createDraftForInvoice(
    invoiceId: string,
    input: PostMerchantInvoiceToGlDto,
    user: AuthUser,
    transaction: Transaction,
  ): Promise<MerchantInvoiceAccountingDraftResult> {
    this.legalEntityAccess.assertCanAccessLegalEntity(user, input.legalEntityId);

    const invoice = await this.invoiceModel.findByPk(invoiceId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!invoice) {
      throw new NotFoundException({
        code: 'MERCHANT_INVOICE_NOT_FOUND',
        message: 'Factura merchant no encontrada.',
      });
    }

    if (invoice.accountingDocumentId) {
      return this.existingDocument(invoice, input, user, transaction);
    }

    const context = await this.revalidateInvoice(invoice, input, transaction);

    const orphan = await this.accountingDocuments.findActiveDocumentBySource(
      { ...MERCHANT_INVOICE_SOURCE, sourceId: invoice.id },
      transaction,
    );
    if (orphan) {
      this.legalEntityAccess.assertCanAccessLegalEntity(user, orphan.legalEntityId);
      this.assertSameLegalEntity(orphan.legalEntityId, input.legalEntityId);
      await invoice.update({ accountingDocumentId: orphan.id }, { transaction });
      this.logger.warnContext(
        MerchantAccountingBridgeService.name,
        'Documento contable huérfano de un intento anterior enlazado a su factura',
        { merchantInvoiceId: invoice.id, accountingDocumentId: orphan.id },
      );
      return this.describe(invoice.id, orphan.id, 'ORPHAN_DOCUMENT_LINKED', transaction);
    }

    const created = await this.accountingDocuments.createDraftInTransaction(
      this.buildDraft(invoice, input, context),
      user,
      transaction,
    );
    await invoice.update({ accountingDocumentId: created.document.id }, { transaction });

    this.logger.infoContext(
      MerchantAccountingBridgeService.name,
      'Borrador contable de factura merchant generado',
      { merchantInvoiceId: invoice.id, accountingDocumentId: created.document.id },
    );
    return this.describe(invoice.id, created.document.id, 'DRAFT_CREATED', transaction);
  }

  private async existingDocument(
    invoice: MerchantInvoiceModel,
    input: PostMerchantInvoiceToGlDto,
    user: AuthUser,
    transaction: Transaction,
  ): Promise<MerchantInvoiceAccountingDraftResult> {
    const documentId = invoice.accountingDocumentId!;
    const { document } = await this.accountingDocuments.getDocument(documentId, transaction);
    this.legalEntityAccess.assertCanAccessLegalEntity(user, document.legalEntityId);
    this.assertSameLegalEntity(document.legalEntityId, input.legalEntityId);
    return this.describe(invoice.id, documentId, 'EXISTING_DOCUMENT_RETURNED', transaction);
  }

  private assertSameLegalEntity(documentLegalEntityId: string, requested: string): void {
    if (documentLegalEntityId !== requested) {
      throw new ConflictException({
        code: 'MERCHANT_INVOICE_LINKED_TO_OTHER_LEGAL_ENTITY',
        message: 'La factura ya tiene documento contable en otra entidad legal.',
      });
    }
  }

  /** Lo que la factura dice de sí misma, comprobado contra lo que pide el cliente. */
  private async revalidateInvoice(
    invoice: MerchantInvoiceModel,
    input: PostMerchantInvoiceToGlDto,
    transaction: Transaction,
  ): Promise<{
    partnerId: string;
    currencyCode: string;
    total: bigint;
    subtotal: bigint;
    tax: bigint;
  }> {
    if (!POSTABLE_INVOICE_STATUSES.has(invoice.status)) {
      throw new ConflictException({
        code: 'MERCHANT_INVOICE_NOT_POSTABLE',
        message: `Una factura en estado ${invoice.status} no se lleva al mayor.`,
      });
    }

    const account = await this.accountModel.findByPk(invoice.accountId, { transaction });
    const partnerId = account?.businessPartnerId ?? null;
    if (!partnerId) {
      throw new BadRequestException({
        code: 'MERCHANT_WITHOUT_BUSINESS_PARTNER',
        message:
          'El comercio no tiene business partner contable vinculado. Vincúlelo a la cuenta B2B antes de contabilizar.',
      });
    }
    if (input.partnerId && input.partnerId !== partnerId) {
      throw new ConflictException({
        code: 'MERCHANT_INVOICE_PARTNER_MISMATCH',
        message: 'La contraparte debe ser la del comercio de la factura.',
      });
    }

    if (invoice.contractId) {
      const contract = await this.contractModel.findByPk(invoice.contractId, { transaction });
      if (!contract || contract.accountId !== invoice.accountId) {
        throw new ConflictException({
          code: 'MERCHANT_INVOICE_CONTRACT_MISMATCH',
          message: 'El contrato de la factura no pertenece a su comercio.',
        });
      }
    }

    const currencyCode = await this.invoiceCurrency(invoice.id, transaction);
    if (input.currencyCode.toUpperCase() !== currencyCode) {
      throw new ConflictException({
        code: 'MERCHANT_INVOICE_CURRENCY_MISMATCH',
        message: `La factura está en ${currencyCode}; no se contabiliza en ${input.currencyCode}.`,
      });
    }
    await this.assertLegalEntityCurrency(input.legalEntityId, currencyCode, transaction);

    const subtotal = parseMoney(invoice.subtotalAmount, { currency: currencyCode });
    const tax = parseMoney(invoice.taxAmount, { currency: currencyCode });
    const total = parseMoney(invoice.totalAmount, { currency: currencyCode, allowZero: false });
    const lines = await this.invoiceLineModel.findAll({
      where: { invoiceId: invoice.id },
      transaction,
    });
    const lineTax = sumMinor(
      lines.map((line) => parseMoney(line.taxAmount, { currency: currencyCode })),
    );
    const lineTotal = sumMinor(
      lines.map((line) => parseMoney(line.totalAmount, { currency: currencyCode })),
    );
    if (subtotal + tax !== total || lineTax !== tax || lineTotal !== total) {
      throw new ConflictException({
        code: 'MERCHANT_INVOICE_TAX_INCONSISTENT',
        message:
          'Los importes de la factura no cuadran (subtotal + impuesto, o cabecera contra líneas).',
      });
    }
    if (tax > 0n && !input.taxAccountId) {
      throw new BadRequestException({
        code: 'TAX_ACCOUNT_REQUIRED',
        message: 'La factura tiene impuesto; indique la cuenta de impuesto (taxAccountId).',
      });
    }

    return { partnerId, currencyCode, total, subtotal, tax };
  }

  /** La moneda de la factura es la de sus cargos, y tiene que ser UNA. */
  private async invoiceCurrency(invoiceId: string, transaction: Transaction): Promise<string> {
    const receivables = await this.receivableModel.findAll({
      where: { invoiceId },
      attributes: ['currency'],
      transaction,
    });
    if (receivables.length === 0) {
      throw new ConflictException({
        code: 'MERCHANT_INVOICE_CURRENCY_UNKNOWN',
        message: 'La factura no tiene cargos de los que deducir su moneda.',
      });
    }
    try {
      return assertSingleCurrency(receivables.map((receivable) => receivable.currency));
    } catch (error) {
      if (error instanceof CurrencyMismatchError) {
        throw new ConflictException({
          code: 'MERCHANT_INVOICE_MIXED_CURRENCIES',
          message: 'La factura mezcla cargos de monedas distintas.',
          details: { currencies: error.currencies },
        });
      }
      throw error;
    }
  }

  /**
   * Sin tipo de cambio registrado el importe local (`amount_lc`) sería el de otra moneda: sólo se
   * contabiliza en la moneda base de la entidad.
   */
  private async assertLegalEntityCurrency(
    legalEntityId: string,
    currencyCode: string,
    transaction: Transaction,
  ): Promise<void> {
    const [row] = await this.sequelize.query<{ base_currency: string }>(
      'SELECT base_currency FROM atlas_accounting.legal_entity WHERE id = :legalEntityId',
      { replacements: { legalEntityId }, type: QueryTypes.SELECT, transaction },
    );
    if (!row) {
      throw new NotFoundException({
        code: 'LEGAL_ENTITY_NOT_FOUND',
        message: 'La entidad legal no existe.',
      });
    }
    if (row.base_currency.trim().toUpperCase() !== currencyCode) {
      throw new ConflictException({
        code: 'MERCHANT_INVOICE_FOREIGN_CURRENCY',
        message: `La entidad legal lleva sus libros en ${row.base_currency}; la factura está en ${currencyCode}.`,
      });
    }
  }

  private buildDraft(
    invoice: MerchantInvoiceModel,
    input: PostMerchantInvoiceToGlDto,
    context: {
      partnerId: string;
      currencyCode: string;
      total: bigint;
      subtotal: bigint;
      tax: bigint;
    },
  ): AccountingDraftInput {
    const { currencyCode, partnerId } = context;
    const total = fromMinorUnits(context.total);
    const subtotal = fromMinorUnits(context.subtotal);
    const lines: AccountingDraftInput['lines'] = [
      {
        glAccountId: input.arAccountId,
        debit: total,
        credit: '0.00',
        currencyCode,
        amountLc: total,
        partnerId,
        referenceType: 'MERCHANT_INVOICE',
        referenceId: invoice.id,
        description: `CxC factura ${invoice.invoiceNumber}`,
      },
      {
        glAccountId: input.revenueAccountId,
        debit: '0.00',
        credit: subtotal,
        currencyCode,
        amountLc: subtotal,
        description: `Ingreso factura ${invoice.invoiceNumber}`,
      },
    ];
    if (context.tax > 0n && input.taxAccountId) {
      const tax = fromMinorUnits(context.tax);
      lines.push({
        glAccountId: input.taxAccountId,
        debit: '0.00',
        credit: tax,
        currencyCode,
        amountLc: tax,
        description: `IVA factura ${invoice.invoiceNumber}`,
      });
    }

    return {
      legalEntityId: input.legalEntityId,
      ...MERCHANT_INVOICE_SOURCE,
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
  }

  private async describe(
    merchantInvoiceId: string,
    accountingDocumentId: string,
    outcome: MerchantInvoiceAccountingOutcome,
    transaction: Transaction,
  ): Promise<MerchantInvoiceAccountingDraftResult> {
    const { document, journal } = await this.accountingDocuments.getDocument(
      accountingDocumentId,
      transaction,
    );
    const postedToLedger = document.status === 'POSTED' && journal?.postingStatus === 'POSTED';
    return {
      merchantInvoiceId,
      accountingDocumentId,
      journalId: journal?.id ?? null,
      accountingDocumentStatus: document.status,
      journalPostingStatus: journal?.postingStatus ?? null,
      postedToLedger,
      outcome,
      nextStep:
        document.status === 'DRAFT'
          ? {
              action: 'POST_ACCOUNTING_DOCUMENT',
              method: 'PATCH',
              path: `/accounting/documents/${accountingDocumentId}/post`,
            }
          : null,
    };
  }
}
