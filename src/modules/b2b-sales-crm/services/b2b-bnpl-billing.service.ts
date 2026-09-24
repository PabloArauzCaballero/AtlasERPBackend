import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Op, Transaction } from 'sequelize';
import { env } from '../../../config/env';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import { nextDocumentNumber } from '../../../common/numbering/document-numbering';
import {
  AccountLifecycleStatus,
  BranchStatus,
  InstallmentStatus,
  InvoiceStatus,
  PurchaseStatus,
  ReceivableStatus,
  TermType,
} from '../b2b-sales-crm.enums';
import type {
  IssueInvoiceDto,
  RegisterMerchantPaymentDto,
  RegisterPurchaseDto,
} from '../b2b-sales-crm.dtos';
import {
  toInvoiceResponse,
  toPurchaseResponse,
  toReceivableResponse,
} from '../b2b-sales-crm.mapper';
import { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';
import { B2BSalesCrmUseCaseBase } from './b2b-sales-crm-use-case.base';
import { linkCoreInstallment } from './core-installment-link.support';
import type { BillingProductModel } from '../models/b2b-sales-crm.models';
import {
  fromMinorUnits,
  parseMoney,
  toMinorUnits,
} from '../../../common/money/decimal-amount.util';
import {
  MoneyRuleViolation,
  allocationsMatchPayment,
  computeInvoiceTotals,
  parsePurchaseSplit,
} from '../domain/merchant-billing-math';

@Injectable()
export class B2BBnplBillingService extends B2BSalesCrmUseCaseBase {
  constructor(repository: B2BSalesCrmRepository, logger: PinoLoggerService) {
    super(repository, logger);
  }

  async registerPurchase(
    input: RegisterPurchaseDto & { merchantAccountId: string },
  ): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BBnplBillingService.name, 'B2B CRM use case started', {
      useCase: 'registerPurchase',
    });
    return this.repository.transaction(async (transaction) => {
      const account = await this.repository.accounts.findByPk(input.merchantAccountId, {
        transaction,
      });
      if (!account) {
        throw new NotFoundException('Cuenta B2B no encontrada.');
      }
      if (account.lifecycleStatus !== AccountLifecycleStatus.CUSTOMER) {
        throw new ForbiddenException('El comercio no está activo como CUSTOMER.');
      }

      const branch = await this.repository.branches.findOne({
        where: { id: input.branchId, accountId: input.merchantAccountId },
        transaction,
      });
      if (!branch || branch.status !== BranchStatus.ACTIVE || !branch.canOriginateBnpl) {
        throw new ForbiddenException('La sucursal no está habilitada para originar BNPL.');
      }

      this.assertPurchaseSplit(input);
      const split = parsePurchaseSplit(input);
      const consumerId = await this.resolveConsumerId(input, transaction);

      const purchaseDate = new Date().toISOString().slice(0, 10);
      const activeVersion = await this.repository.findActiveContractVersion(
        input.merchantAccountId,
        purchaseDate,
        transaction,
      );
      if (!activeVersion) {
        throw new ConflictException(
          'El comercio no tiene versión contractual activa para la fecha de compra.',
        );
      }

      const mdr = this.calculateMdr(
        input.purchaseAmount,
        activeVersion,
        input.branchId,
        input.productCategory,
        input.riskTierAtOrigination,
      );

      const purchase = await this.repository.purchases.create(
        {
          merchantAccountId: input.merchantAccountId,
          branchId: input.branchId,
          consumerId,
          contractVersionId: activeVersion.id,
          purchaseAmount: fromMinorUnits(split.purchase),
          downPaymentAmount: fromMinorUnits(split.downPayment),
          financedAmount: fromMinorUnits(split.financed),
          riskTierAtOrigination: input.riskTierAtOrigination ?? null,
          cohortId: input.cohortId ?? null,
          status: PurchaseStatus.CONFIRMED,
          mdrRatePercent: mdr.ratePercent,
          mdrAmount: mdr.amount,
          mdrRuleId: mdr.ruleId,
          mdrPricingSource: mdr.source,
        },
        { transaction },
      );

      const consumerPaymentToMerchant = await this.repository.consumerPaymentsToMerchant.create(
        {
          purchaseId: purchase.id,
          installmentId: null,
          amount: fromMinorUnits(split.downPayment),
          paidAt: input.downPaymentPaidAt ?? new Date(),
          evidenceRef: input.downPaymentEvidenceRef ?? null,
          status: 'REPORTED',
        },
        { transaction },
      );

      for (const [index, installment] of input.installments.entries()) {
        const created = await this.repository.installments.create(
          {
            purchaseId: purchase.id,
            installmentNumber: installment.installmentNumber,
            dueDate: installment.dueDate,
            amount: fromMinorUnits(split.installments[index]!),
            status: InstallmentStatus.SCHEDULED,
          },
          { transaction },
        );
        if (input.coreLoanRef && installment.coreInstallmentId) {
          await linkCoreInstallment(
            this.repository.sequelize,
            {
              erpPurchaseId: purchase.id,
              erpInstallmentId: created.id,
              coreTenantId: input.coreLoanRef.tenantId,
              coreLoanId: input.coreLoanRef.loanId,
              coreInstallmentId: installment.coreInstallmentId,
              corePartnerProfileId: input.coreLoanRef.partnerProfileId ?? null,
            },
            transaction,
          );
        }
      }

      const mdrProduct = await this.findProductBySourceType(TermType.MDR, transaction);
      const receivable = await this.repository.receivables.create(
        {
          accountId: input.merchantAccountId,
          invoiceId: null,
          sourceType: TermType.MDR,
          sourceId: purchase.id,
          productId: mdrProduct?.id ?? null,
          amountOriginal: mdr.amount,
          amountOpen: mdr.amount,
          currency: 'BOB',
          dueDate: input.mdrReceivableDueDate,
          status: ReceivableStatus.PENDING,
        },
        { transaction },
      );

      const created = await this.repository.findPurchaseWithInstallments(purchase.id, transaction);
      return {
        purchase: toPurchaseResponse(
          this.requireEntity(created, 'Compra no encontrada luego de crear.'),
        ),
        consumerPaymentToMerchant: {
          id: consumerPaymentToMerchant.id,
          purchaseId: consumerPaymentToMerchant.purchaseId,
          installmentId: consumerPaymentToMerchant.installmentId,
          amount: consumerPaymentToMerchant.amount,
          paidAt: consumerPaymentToMerchant.paidAt,
          status: consumerPaymentToMerchant.status,
        },
        mdr: {
          /* `number` por compatibilidad del contrato HTTP: sólo se muestra, no se opera. */
          ratePercent: Number(mdr.ratePercent),
          amount: mdr.amount,
          source: mdr.source,
        },
        receivable: toReceivableResponse(receivable),
      };
    });
  }

  async issueInvoice(input: IssueInvoiceDto): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BBnplBillingService.name, 'B2B CRM use case started', {
      useCase: 'issueInvoice',
    });
    return this.repository.transaction(async (transaction) => {
      const receivables = await this.repository.receivables.findAll({
        where: { id: { [Op.in]: input.receivableIds }, accountId: input.accountId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (receivables.length !== input.receivableIds.length) {
        throw new NotFoundException('Uno o más cargos CxC no existen o no pertenecen al comercio.');
      }

      if (receivables.some((receivable) => receivable.invoiceId !== null)) {
        throw new ConflictException('Uno o más cargos ya fueron facturados.');
      }

      if (receivables.some((receivable) => receivable.status !== ReceivableStatus.PENDING)) {
        throw new ConflictException('Solo se pueden facturar cargos CxC pendientes.');
      }

      if (receivables.some((receivable) => toMinorUnits(receivable.amountOpen) <= 0n)) {
        throw new ConflictException('No se pueden facturar cargos CxC sin saldo abierto.');
      }

      /*
       * Céntimos exactos, una sola moneda y el impuesto de las líneas sumando el de la cabecera
       * (P-07). La tasa sale de `DEFAULT_TAX_RATE_PERCENT`; su valor lo valida Fiscal.
       */
      const totals = this.invoiceTotals(receivables);
      const lineTotals = new Map(totals.lines.map((line) => [line.id, line]));

      /*
       * La serie de facturas de comercio es única en toda la instalación —así la declara el índice
       * de `merchant_invoices`—, así que no lleva ámbito: un solo correlativo por año.
       */
      const invoiceNumber = await nextDocumentNumber(
        this.repository.sequelize,
        {
          prefix: 'FAC-CM',
          table: 'atlas_sales.merchant_invoices',
          column: 'invoice_number',
          date: input.invoiceDate,
        },
        transaction,
      );

      const invoice = await this.repository.invoices.create(
        {
          accountId: input.accountId,
          contractId: input.contractId ?? null,
          invoiceNumber,
          invoiceDate: input.invoiceDate,
          dueDate: input.dueDate,
          subtotalAmount: totals.subtotal,
          taxAmount: totals.tax,
          totalAmount: totals.total,
          status: InvoiceStatus.ISSUED,
          externalTaxRef: input.externalTaxRef ?? null,
        },
        { transaction },
      );

      /*
       * La línea de factura nombra un PRODUCTO, no un enum.
       *
       * Antes decía «Cargo MDR» porque lo único que había era el tipo de origen del cargo, y eso
       * es lo que leía el comercio en su factura. El catálogo se resuelve por ese mismo
       * `sourceType`, así que lo emitido antes de que existiera sigue cuadrando; si un cargo no
       * tiene producto —origen antiguo o dado de baja— se conserva el texto de siempre en vez de
       * bloquear la emisión.
       */
      const products = await this.findProductsBySourceType(
        receivables.map((receivable) => receivable.sourceType),
        transaction,
      );

      for (const receivable of receivables) {
        const line = lineTotals.get(receivable.id)!;
        const product = products.get(receivable.sourceType) ?? null;
        await this.repository.invoiceLines.create(
          {
            invoiceId: invoice.id,
            sourceType: receivable.sourceType,
            sourceId: receivable.sourceId,
            productId: receivable.productId ?? product?.id ?? null,
            description: product ? product.name : `Cargo ${receivable.sourceType}`,
            quantity: '1.0000',
            unitAmount: line.net,
            taxAmount: line.tax,
            totalAmount: line.total,
          },
          { transaction },
        );
        await receivable.update({ invoiceId: invoice.id }, { transaction });
      }

      const created = await this.repository.findInvoiceWithLines(invoice.id, transaction);
      return toInvoiceResponse(
        this.requireEntity(created, 'Factura no encontrada luego de crear.'),
      );
    });
  }

  async registerMerchantPayment(
    input: RegisterMerchantPaymentDto,
  ): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BBnplBillingService.name, 'B2B CRM use case started', {
      useCase: 'registerMerchantPayment',
    });
    return this.repository.transaction(async (transaction) => {
      if (!allocationsMatchPayment(input.amount, input.allocations, input.currency)) {
        throw new BadRequestException(
          'La suma de asignaciones debe coincidir con el monto total del pago.',
        );
      }

      const payment = await this.repository.payments.create(
        {
          accountId: input.accountId,
          amount: fromMinorUnits(parseMoney(input.amount, { currency: input.currency })),
          currency: input.currency,
          paidAt: input.paidAt,
          paymentMethod: input.paymentMethod ?? null,
          externalRef: input.externalRef ?? null,
          status: 'CONFIRMED',
        },
        { transaction },
      );

      const touchedInvoiceIds = new Set<string>();

      for (const allocation of input.allocations) {
        const receivable = await this.repository.receivables.findOne({
          where: { id: allocation.receivableId, accountId: input.accountId },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });

        if (!receivable) {
          throw new NotFoundException('CxC comercial no encontrada para aplicar pago.');
        }

        /* Un pago en BOB no cancela una CxC en USD: sin tipo de cambio no hay equivalencia. */
        if (receivable.currency.trim().toUpperCase() !== input.currency) {
          throw new ConflictException({
            code: 'PAYMENT_CURRENCY_MISMATCH',
            message: `La CxC está en ${receivable.currency} y el pago en ${input.currency}.`,
          });
        }

        const currentOpen = toMinorUnits(receivable.amountOpen);
        const applied = parseMoney(allocation.amountApplied, {
          currency: input.currency,
          allowZero: false,
        });
        if (applied > currentOpen) {
          throw new ConflictException('Una asignación excede el saldo abierto de la CxC.');
        }

        await this.repository.paymentAllocations.create(
          {
            paymentId: payment.id,
            receivableId: receivable.id,
            amountApplied: fromMinorUnits(applied),
          },
          { transaction },
        );

        const nextOpen = currentOpen - applied;
        await receivable.update(
          {
            amountOpen: fromMinorUnits(nextOpen),
            status: nextOpen === 0n ? ReceivableStatus.PAID : ReceivableStatus.PARTIALLY_PAID,
          },
          { transaction },
        );

        if (receivable.invoiceId) {
          touchedInvoiceIds.add(receivable.invoiceId);
        }
      }

      for (const invoiceId of touchedInvoiceIds) {
        await this.refreshInvoicePaymentStatus(invoiceId, transaction);
      }

      return {
        paymentId: payment.id,
        amount: payment.amount,
        allocations: input.allocations,
      };
    });
  }

  private invoiceTotals(
    receivables: ReadonlyArray<{ id: string; amountOpen: string; currency: string }>,
  ): ReturnType<typeof computeInvoiceTotals> {
    try {
      return computeInvoiceTotals(
        receivables.map((receivable) => ({
          id: receivable.id,
          amountOpen: receivable.amountOpen,
          currency: receivable.currency,
        })),
        env.DEFAULT_TAX_RATE_PERCENT,
      );
    } catch (error) {
      if (error instanceof MoneyRuleViolation) {
        throw new ConflictException({ code: error.code, message: error.message });
      }
      throw error;
    }
  }

  /** Producto del catálogo que corresponde a un origen de cargo, o `null` si no hay ninguno. */
  private async findProductBySourceType(
    sourceType: string,
    transaction: Transaction,
  ): Promise<BillingProductModel | null> {
    return this.repository.billingProducts.findOne({
      where: { sourceType, status: 'ACTIVE' },
      transaction,
    });
  }

  private async findProductsBySourceType(
    sourceTypes: string[],
    transaction: Transaction,
  ): Promise<Map<string, BillingProductModel>> {
    const unique = [...new Set(sourceTypes)];
    if (unique.length === 0) return new Map();
    const products = await this.repository.billingProducts.findAll({
      where: { sourceType: { [Op.in]: unique } },
      transaction,
    });
    return new Map(products.map((product) => [product.sourceType, product]));
  }

  private async refreshInvoicePaymentStatus(
    invoiceId: string,
    transaction: Transaction,
  ): Promise<void> {
    const receivables = await this.repository.receivables.findAll({
      where: { invoiceId },
      transaction,
    });
    const invoice = await this.repository.invoices.findByPk(invoiceId, { transaction });

    if (!invoice || receivables.length === 0) {
      return;
    }

    const allPaid = receivables.every((receivable) => toMinorUnits(receivable.amountOpen) === 0n);
    const anyPartial = receivables.some(
      (receivable) => toMinorUnits(receivable.amountOpen) < toMinorUnits(receivable.amountOriginal),
    );

    await invoice.update(
      {
        status: allPaid
          ? InvoiceStatus.PAID
          : anyPartial
            ? InvoiceStatus.PARTIALLY_PAID
            : InvoiceStatus.ISSUED,
      },
      { transaction },
    );
  }

  /**
   * Traduce lo que el comercio SI conoce —el documento del cliente— al identificador interno.
   *
   * Antes `consumerId` era obligatorio y de tipo uuid: en el mostrador nadie tiene ese dato, asi
   * que la pantalla de registro BNPL era inservible para su unico usuario previsto. Ahora:
   *  - si llega el uuid, se respeta (integraciones que ya lo tienen);
   *  - si llega el documento, se busca por el y se reutiliza el cliente si ya compro antes —que es
   *    lo que evita duplicar a la misma persona en cada compra—;
   *  - si no existe, se crea uno nuevo con ese documento.
   */
  private async resolveConsumerId(
    input: { consumerId?: string; consumerExternalRef?: string },
    transaction: Transaction,
  ): Promise<string> {
    if (input.consumerId) {
      await this.repository.consumers.findOrCreate({
        where: { id: input.consumerId },
        defaults: { id: input.consumerId, externalRef: input.consumerExternalRef ?? null },
        transaction,
      });
      return input.consumerId;
    }

    const externalRef = input.consumerExternalRef?.trim();
    if (!externalRef) {
      throw new ConflictException('Indique el documento del cliente o su identificador en Atlas.');
    }

    const existing = await this.repository.consumers.findOne({
      where: { externalRef },
      transaction,
    });
    if (existing) return existing.id;

    const created = await this.repository.consumers.create({ externalRef }, { transaction });
    return created.id;
  }
}
