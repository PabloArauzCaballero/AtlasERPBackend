import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  B2BAccountModel,
  MerchantInvoiceLineModel,
  MerchantInvoiceModel,
  MerchantPlanModel,
  MerchantReceivableModel,
  MerchantSubscriptionModel,
} from '../../b2b-sales-crm/models/b2b-sales-crm.models';
import { normalizeAmount } from '../../../common/money/decimal-amount.util';
import { PORTAL_BILLING_DOCUMENT_LIMIT } from '../portal.constants';
import {
  toInvoiceDto,
  toReceivableDto,
  toSubscriptionDto,
  type PortalSubscriptionDto,
} from '../portal.mappers';
import { PortalScopeService, type PortalScope } from '../portal.scope.service';

interface BillingTotalsRow {
  invoice_count: string;
  invoiced_total: string;
  open_receivable_count: string;
  open_total: string;
}

/** Lo que el comercio le debe a Atlas y lo que Atlas le facturó: comisiones, suscripción, panel y facturas. */
@Injectable()
export class PortalBillingQueryService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly scopeService: PortalScopeService,
    @InjectModel(MerchantSubscriptionModel)
    private readonly subscriptionModel: typeof MerchantSubscriptionModel,
    @InjectModel(B2BAccountModel) private readonly accountModel: typeof B2BAccountModel,
    @InjectModel(MerchantInvoiceModel) private readonly invoiceModel: typeof MerchantInvoiceModel,
    @InjectModel(MerchantInvoiceLineModel)
    private readonly invoiceLineModel: typeof MerchantInvoiceLineModel,
    @InjectModel(MerchantReceivableModel)
    private readonly receivableModel: typeof MerchantReceivableModel,
  ) {}

  /**
   * Lo que este comercio le debe a Atlas: la comision de cada venta.
   *
   * El `accountId` sale del ALCANCE, no del parametro: un comercio no puede consultar la comision
   * de otro, y el staff interno si elige pero queda auditado como acceso delegado. Es el mismo
   * `resolveAccountId` que gobierna el resto del portal.
   */
  async listCommissions(scope: PortalScope, requestedAccountId?: string) {
    const merchantAccountId = this.scopeService.resolveAccountId(scope, requestedAccountId);
    const filas = await this.receivableModel.findAll({
      where: { accountId: merchantAccountId, sourceType: 'MDR' } as never,
      order: [['issued_at', 'DESC']],
      limit: 200,
    });

    const total = filas.reduce((suma, fila) => suma + Number(fila.amountOriginal), 0);
    /*
     * Lo ABIERTO es lo que de verdad debe. Una comision ya facturada y pagada dejo de ser deuda, y
     * presentarla como pendiente haria que el comercio provisionara dos veces el mismo dinero.
     */
    const abierto = filas.reduce((suma, fila) => suma + Number(fila.amountOpen), 0);

    return {
      summary: {
        chargedTotal: normalizeAmount(String(total)),
        owedToAtlas: normalizeAmount(String(abierto)),
        settled: normalizeAmount(String(total - abierto)),
        salesCharged: filas.length,
      },
      commissions: filas.map((fila) => ({
        id: fila.id,
        purchaseId: fila.sourceId,
        amountCharged: normalizeAmount(fila.amountOriginal),
        amountOpen: normalizeAmount(fila.amountOpen),
        currency: fila.currency,
        issuedAt: fila.issuedAt,
        dueDate: fila.dueDate,
        status: fila.status,
      })),
    };
  }

  async getSubscription(
    scope: PortalScope,
    requestedAccountId?: string,
  ): Promise<PortalSubscriptionDto | null> {
    const merchantAccountId = this.scopeService.resolveAccountId(scope, requestedAccountId);
    const subscription = await this.findActiveSubscription(merchantAccountId);
    return toSubscriptionDto(subscription);
  }

  /**
   * Panel de consumo y facturación del comercio.
   *
   * Los totales se calculan en la base sobre el universo completo de documentos y con aritmética
   * `numeric`, no sumando en JavaScript la página devuelta: la versión anterior acumulaba en coma
   * flotante solo las primeras 100 filas y presentaba ese resultado como "monto acumulado", lo que
   * subdeclaraba el facturado y el saldo abierto de cualquier comercio con historial.
   */
  async getBillingPanel(scope: PortalScope, requestedAccountId?: string) {
    const merchantAccountId = this.scopeService.resolveAccountId(scope, requestedAccountId);

    const [subscription, invoices, receivables, totals] = await Promise.all([
      this.findActiveSubscription(merchantAccountId),
      this.invoiceModel.findAll({
        where: { accountId: merchantAccountId },
        order: [
          ['invoiceDate', 'DESC'],
          ['id', 'DESC'],
        ],
        limit: PORTAL_BILLING_DOCUMENT_LIMIT,
      }),
      this.receivableModel.findAll({
        where: { accountId: merchantAccountId },
        order: [
          ['issuedAt', 'DESC'],
          ['id', 'DESC'],
        ],
        limit: PORTAL_BILLING_DOCUMENT_LIMIT,
      }),
      this.loadBillingTotals(merchantAccountId),
    ]);

    const subscriptionDto = toSubscriptionDto(subscription);

    return {
      merchantAccountId,
      subscription: subscriptionDto,
      invoices: invoices.map((invoice) => toInvoiceDto(invoice)),
      receivables: receivables.map((receivable) => toReceivableDto(receivable)),
      documentLimit: PORTAL_BILLING_DOCUMENT_LIMIT,
      summary: {
        invoiceCount: totals.invoiceCount,
        invoicedTotal: totals.invoicedTotal,
        openReceivableCount: totals.openReceivableCount,
        openTotal: totals.openTotal,
        monthlyPlanPrice: subscriptionDto?.plan?.monthlyPrice ?? '0.00',
        planName: subscriptionDto?.plan?.name ?? null,
        currency: subscriptionDto?.plan?.currency ?? null,
      },
    };
  }

  /**
   * Una factura del comercio, con sus líneas, para poder descargarla.
   *
   * Se busca DENTRO de la cuenta que el llamador puede ver, no por identificador suelto: si no
   * fuera así, cualquier comercio podría pedir la factura de otro sabiendo su uuid.
   */
  async getInvoiceDocument(scope: PortalScope, invoiceId: string, requestedAccountId?: string) {
    const merchantAccountId = this.scopeService.resolveAccountId(scope, requestedAccountId);
    const invoice = await this.invoiceModel.findOne({
      where: { id: invoiceId, accountId: merchantAccountId },
    });
    if (!invoice)
      throw new NotFoundException('La factura no existe o no pertenece a este comercio.');

    const [lines, account] = await Promise.all([
      this.invoiceLineModel.findAll({ where: { invoiceId: invoice.id } }),
      this.accountModel.findByPk(merchantAccountId),
    ]);

    return {
      invoice: toInvoiceDto(invoice),
      lines: lines.map((line) => ({
        id: line.id,
        description: line.description,
        quantity: normalizeAmount(line.quantity),
        unitAmount: normalizeAmount(line.unitAmount),
        taxAmount: normalizeAmount(line.taxAmount),
        totalAmount: normalizeAmount(line.totalAmount),
      })),
      account: account
        ? {
            id: account.id,
            legalName: account.legalName,
            tradeName: account.tradeName,
            taxId: account.taxId,
            city: account.city,
            address: account.address,
          }
        : null,
    };
  }

  private findActiveSubscription(
    merchantAccountId: string,
    transaction?: Transaction,
  ): Promise<MerchantSubscriptionModel | null> {
    return this.subscriptionModel.findOne({
      where: { merchantAccountId, status: 'ACTIVE' },
      include: [{ model: MerchantPlanModel }],
      order: [['startedAt', 'DESC']],
      transaction,
    });
  }

  private async loadBillingTotals(merchantAccountId: string): Promise<{
    invoiceCount: number;
    invoicedTotal: string;
    openReceivableCount: number;
    openTotal: string;
  }> {
    const [row] = await this.sequelize.query<BillingTotalsRow>(
      `SELECT
         (SELECT count(*) FROM atlas_sales.merchant_invoices WHERE account_id = $1) AS invoice_count,
         (SELECT coalesce(sum(total_amount), 0) FROM atlas_sales.merchant_invoices WHERE account_id = $1) AS invoiced_total,
         (SELECT count(*) FROM atlas_sales.merchant_receivables WHERE account_id = $1 AND amount_open > 0) AS open_receivable_count,
         (SELECT coalesce(sum(amount_open), 0) FROM atlas_sales.merchant_receivables WHERE account_id = $1) AS open_total`,
      { bind: [merchantAccountId], type: QueryTypes.SELECT },
    );

    return {
      invoiceCount: Number(row?.invoice_count ?? 0),
      invoicedTotal: normalizeAmount(row?.invoiced_total ?? '0'),
      openReceivableCount: Number(row?.open_receivable_count ?? 0),
      openTotal: normalizeAmount(row?.open_total ?? '0'),
    };
  }
}
