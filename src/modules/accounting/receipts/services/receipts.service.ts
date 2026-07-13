import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ArInvoiceModel, ReceiptAllocationModel, ReceiptModel } from '../../../../database/models';
import { AuthUser } from '../../../../common/types/auth-context.types';
import { RecordReceiptDto } from '../../shared/schemas/accounting.schemas';
import { AccountingDocumentsService } from '../../documents/services/accounting-documents.service';
import { BusinessPartnerRoleValidationService } from '../../business-partners/services/business-partner-role-validation.service';
import { LegalEntityAccessService } from '../../../../common/services/legal-entity-access.service';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

/**
 * Registra cobros y aplica asignaciones AR con validación de saldos abiertos.
 */
@Injectable()
export class ReceiptsService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly accountingDocumentsService: AccountingDocumentsService,
    private readonly businessPartnerRoleValidationService: BusinessPartnerRoleValidationService,
    private readonly legalEntityAccessService: LegalEntityAccessService,
    private readonly logger: PinoLoggerService,
    @InjectModel(ReceiptModel) private readonly receiptModel: typeof ReceiptModel,
    @InjectModel(ReceiptAllocationModel)
    private readonly receiptAllocationModel: typeof ReceiptAllocationModel,
    @InjectModel(ArInvoiceModel) private readonly arInvoiceModel: typeof ArInvoiceModel,
  ) {}

  async list(user: AuthUser) {
    const rows = await this.receiptModel.findAll();
    const items = rows.filter((row) => { try { this.legalEntityAccessService.assertCanAccessLegalEntity(user, row.legalEntityId); return true; } catch { return false; } });
    return { items, total: items.length };
  }

  async update(id: string, input: Record<string, unknown>, user: AuthUser) {
    const row = await this.receiptModel.findByPk(id);
    if (!row) throw new NotFoundException({ code: 'RECEIPT_NOT_FOUND', message: 'El recibo no existe.' });
    this.legalEntityAccessService.assertCanAccessLegalEntity(user, row.legalEntityId);
    const allowed = ['receiptNo', 'receiptDate', 'status', 'bankAccountId'];
    await row.update(Object.fromEntries(Object.entries(input).filter(([key]) => allowed.includes(key))));
    return row;
  }

  async remove(id: string, user: AuthUser) {
    const row = await this.receiptModel.findByPk(id);
    if (!row) throw new NotFoundException({ code: 'RECEIPT_NOT_FOUND', message: 'El recibo no existe.' });
    this.legalEntityAccessService.assertCanAccessLegalEntity(user, row.legalEntityId);
    await this.receiptAllocationModel.destroy({ where: { receiptId: id } });
    await row.destroy(); return { id, deleted: true };
  }

  record(input: RecordReceiptDto, user: AuthUser) {
    this.logger.info('Registrando recibo AR.', {
      layer: 'service',
      module: 'receipts',
      action: 'record',
      receiptNo: input.receiptNo,
      legalEntityId: input.legalEntityId,
      payerBpId: input.payerBpId,
      allocationCount: input.allocations.length,
      userId: user.sub,
    });
    return this.sequelize.transaction(async (transaction) => {
      this.legalEntityAccessService.assertCanAccessLegalEntity(user, input.legalEntityId);
      await this.assertReceiptCanBeRecorded(input, transaction);

      const receipt = await this.receiptModel.create(
        {
          legalEntityId: input.legalEntityId,
          payerBpId: input.payerBpId,
          receiptNo: input.receiptNo,
          receiptDate: input.receiptDate,
          amount: input.amount,
          currencyCode: input.currencyCode,
          bankAccountId: input.bankAccountId,
          status: 'RECORDED',
        },
        { transaction },
      );

      await this.receiptAllocationModel.bulkCreate(
        input.allocations.map((allocation) => ({
          receiptId: receipt.id,
          arInvoiceId: allocation.arInvoiceId,
          allocatedAmount: allocation.allocatedAmount,
        })),
        { transaction },
      );

      await this.updateInvoiceStatusesAfterAllocation(input, transaction);

      const accounting = await this.accountingDocumentsService.createDraftInTransaction(
        {
          legalEntityId: input.legalEntityId,
          sourceSystem: 'TREASURY',
          sourceType: 'RECEIPT',
          sourceId: receipt.id,
          documentType: 'RECEIPT',
          documentNo: `RCPT-${input.receiptNo}`,
          documentDate: input.receiptDate,
          postingDate: input.receiptDate,
          accountingPeriodId: input.accountingPeriodId,
          ledgerId: input.ledgerId,
          currencyCode: input.currencyCode,
          approvalStatus: 'NOT_REQUIRED',
          lines: [
            {
              glAccountId: input.bankGlAccountId,
              debit: input.amount,
              credit: 0,
              currencyCode: input.currencyCode,
              amountLc: input.amount,
              partnerId: input.payerBpId,
              referenceType: 'RECEIPT',
              referenceId: receipt.id,
              description: `Ingreso banco recibo ${input.receiptNo}`,
            },
            {
              glAccountId: input.arControlGlAccountId,
              debit: 0,
              credit: input.amount,
              currencyCode: input.currencyCode,
              amountLc: input.amount,
              partnerId: input.payerBpId,
              referenceType: 'RECEIPT',
              referenceId: receipt.id,
              description: `Cancelación CxC recibo ${input.receiptNo}`,
            },
          ],
        },
        user,
        transaction,
      );

      await this.accountingDocumentsService.postDocumentInTransaction(
        accounting.document.id,
        user,
        transaction,
      );
      await receipt.update({ accountingDocumentId: accounting.document.id }, { transaction });

      this.logger.info('Recibo AR registrado y contabilizado.', {
        layer: 'service',
        module: 'receipts',
        action: 'record',
        receiptId: receipt.id,
        receiptNo: receipt.receiptNo,
        accountingDocumentId: accounting.document.id,
      });
      return { receipt, accountingDocumentId: accounting.document.id };
    });
  }

  private async assertReceiptCanBeRecorded(
    input: RecordReceiptDto,
    transaction: Transaction,
  ): Promise<void> {
    this.logger.debug('Validando recibo AR.', {
      layer: 'service',
      module: 'receipts',
      action: 'assertReceiptCanBeRecorded',
      receiptNo: input.receiptNo,
      legalEntityId: input.legalEntityId,
    });
    await this.businessPartnerRoleValidationService.assertHasAnyActiveRole(
      input.payerBpId,
      ['CUSTOMER', 'MERCHANT', 'INTERCOMPANY'],
      input.legalEntityId,
      transaction,
    );

    const allocationTotal = input.allocations.reduce(
      (sum, allocation) => sum + Number(allocation.allocatedAmount),
      0,
    );

    if (Math.abs(allocationTotal - Number(input.amount)) > 0.009) {
      throw new BadRequestException({
        code: 'RECEIPT_ALLOCATION_TOTAL_MISMATCH',
        message: 'La suma de asignaciones debe ser igual al monto total del recibo.',
        details: { amount: input.amount, allocationTotal },
      });
    }

    const allocationsByInvoice = new Map<string, number>();
    for (const allocation of input.allocations) {
      allocationsByInvoice.set(
        allocation.arInvoiceId,
        (allocationsByInvoice.get(allocation.arInvoiceId) ?? 0) +
          Number(allocation.allocatedAmount),
      );
    }

    for (const [arInvoiceId, allocatedAmount] of allocationsByInvoice.entries()) {
      await this.assertInvoiceHasOpenBalance(input, arInvoiceId, allocatedAmount, transaction);
    }
  }

  private async assertInvoiceHasOpenBalance(
    input: RecordReceiptDto,
    arInvoiceId: string,
    allocatedAmount: number,
    transaction: Transaction,
  ): Promise<void> {
    this.logger.debug('Validando saldo abierto de factura AR con lock transaccional.', {
      layer: 'service',
      module: 'receipts',
      action: 'assertInvoiceHasOpenBalance',
      arInvoiceId,
      allocatedAmount,
    });
    const invoice = await this.arInvoiceModel.findByPk(arInvoiceId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!invoice) {
      throw new NotFoundException({
        code: 'AR_INVOICE_NOT_FOUND',
        message: 'La factura AR asignada al cobro no existe.',
      });
    }

    if (invoice.legalEntityId !== input.legalEntityId || invoice.customerBpId !== input.payerBpId) {
      throw new ConflictException({
        code: 'RECEIPT_INVOICE_MISMATCH',
        message: 'La factura AR no corresponde a la entidad legal o pagador del recibo.',
      });
    }

    if (!['ISSUED', 'PARTIALLY_PAID'].includes(invoice.status)) {
      throw new ConflictException({
        code: 'AR_INVOICE_NOT_OPEN',
        message: 'Solo se pueden aplicar cobros a facturas AR emitidas o parcialmente pagadas.',
      });
    }

    const alreadyAllocated = await this.receiptAllocationModel.sum('allocatedAmount', {
      where: { arInvoiceId },
      transaction,
    });
    const outstandingAmount = Number(invoice.grossAmount) - Number(alreadyAllocated ?? 0);

    if (Number(allocatedAmount) - outstandingAmount > 0.009) {
      throw new ConflictException({
        code: 'AR_INVOICE_ALLOCATION_EXCEEDS_OPEN_BALANCE',
        message: 'La asignación del cobro excede el saldo abierto de la factura.',
        details: { arInvoiceId, allocatedAmount, outstandingAmount },
      });
    }
  }

  private async updateInvoiceStatusesAfterAllocation(
    input: RecordReceiptDto,
    transaction: Transaction,
  ): Promise<void> {
    this.logger.debug('Actualizando estados de facturas AR tras asignación.', {
      layer: 'service',
      module: 'receipts',
      action: 'updateInvoiceStatusesAfterAllocation',
      receiptNo: input.receiptNo,
    });
    const invoiceIds = [...new Set(input.allocations.map((allocation) => allocation.arInvoiceId))];

    for (const arInvoiceId of invoiceIds) {
      this.logger.debug('Recalculando estado de factura AR con lock transaccional.', {
        layer: 'service',
        module: 'receipts',
        action: 'updateInvoiceStatusesAfterAllocation',
        arInvoiceId,
      });
      const invoice = await this.arInvoiceModel.findByPk(arInvoiceId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!invoice) continue;

      const allocatedAfterReceipt = await this.receiptAllocationModel.sum('allocatedAmount', {
        where: { arInvoiceId },
        transaction,
      });
      const outstandingAmount = Number(invoice.grossAmount) - Number(allocatedAfterReceipt ?? 0);
      const status = outstandingAmount <= 0.009 ? 'PAID' : 'PARTIALLY_PAID';
      await invoice.update({ status }, { transaction });
    }
  }
}
