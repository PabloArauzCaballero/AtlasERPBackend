import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes, type Transaction, type WhereOptions } from 'sequelize';
import { PinoLogger } from 'nestjs-pino';
import {
  BillingProfileModel,
  InvoiceLineModel,
  InvoiceModel,
  PaymentModel,
  SpendLedgerModel,
} from '../models';

export interface LedgerGroupRow {
  advertiserId: string;
  campaignId: string | null;
  currency: string;
  amountMicros: string;
  billableEvents: string;
}

@Injectable()
export class BillingRepository {
  constructor(
    @InjectModel(BillingProfileModel)
    private readonly billingProfileModel: typeof BillingProfileModel,
    @InjectModel(SpendLedgerModel) private readonly ledgerModel: typeof SpendLedgerModel,
    @InjectModel(InvoiceModel) private readonly invoiceModel: typeof InvoiceModel,
    @InjectModel(InvoiceLineModel) private readonly invoiceLineModel: typeof InvoiceLineModel,
    @InjectModel(PaymentModel) private readonly paymentModel: typeof PaymentModel,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(BillingRepository.name);
  }

  findDefaultBillingProfile(
    advertiserId: string,
    transaction?: Transaction,
  ): Promise<BillingProfileModel | null> {
    return this.billingProfileModel.findOne({
      where: { advertiserId, status: 'ACTIVE' },
      order: [
        ['is_default', 'DESC'],
        ['created_at', 'DESC'],
      ],
      transaction,
    });
  }

  async getLedgerGroups(
    periodStart: string,
    periodEnd: string,
    advertiserId?: string,
  ): Promise<LedgerGroupRow[]> {
    const where: WhereOptions = {
      entry_type: { [Op.in]: ['CHARGE', 'CREDIT', 'ADJUSTMENT', 'REFUND'] },
      occurred_at: {
        [Op.gte]: new Date(`${periodStart}T00:00:00.000Z`),
        [Op.lte]: new Date(`${periodEnd}T23:59:59.999Z`),
      },
    };
    if (advertiserId) where.advertiser_id = advertiserId;

    return this.ledgerModel.sequelize!.query<LedgerGroupRow>(
      `SELECT advertiser_id AS "advertiserId", campaign_id AS "campaignId", currency, SUM(amount_micros)::text AS "amountMicros", COUNT(*)::text AS "billableEvents"
       FROM ad_spend_ledger
       WHERE entry_type IN ('CHARGE','CREDIT','ADJUSTMENT','REFUND')
         AND occurred_at BETWEEN :periodStartDate AND :periodEndDate
         ${advertiserId ? 'AND advertiser_id = :advertiserId' : ''}
       GROUP BY advertiser_id, campaign_id, currency
       HAVING SUM(amount_micros) <> 0
       ORDER BY advertiser_id, currency`,
      {
        type: QueryTypes.SELECT,
        replacements: {
          periodStartDate: `${periodStart}T00:00:00.000Z`,
          periodEndDate: `${periodEnd}T23:59:59.999Z`,
          advertiserId,
        },
      },
    );
  }

  async assertPeriodIsNotClosed(
    advertiserIds: string[],
    periodStart: string,
    periodEnd: string,
    transaction?: Transaction,
  ): Promise<void> {
    const existingInvoice = await this.invoiceModel.findOne({
      where: {
        advertiserId: { [Op.in]: advertiserIds },
        periodStart,
        periodEnd,
        status: { [Op.ne]: 'VOID' },
      },
      transaction,
    });

    if (existingInvoice) {
      throw new ConflictException({
        code: 'BILLING_PERIOD_ALREADY_CLOSED',
        message:
          'Ya existe una factura no anulada para al menos un anunciante dentro del periodo solicitado.',
      });
    }
  }

  createInvoice(values: Partial<InvoiceModel>, transaction?: Transaction): Promise<InvoiceModel> {
    return this.invoiceModel.create(values, { transaction });
  }

  createInvoiceLine(
    values: Partial<InvoiceLineModel>,
    transaction?: Transaction,
  ): Promise<InvoiceLineModel> {
    return this.invoiceLineModel.create(values, { transaction });
  }

  async findInvoiceOrThrow(invoiceId: string, transaction?: Transaction): Promise<InvoiceModel> {
    const invoice = await this.invoiceModel.findByPk(invoiceId, {
      include: [PaymentModel],
      transaction,
    });
    if (!invoice) {
      throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'La factura no existe.' });
    }
    return invoice;
  }

  createPayment(values: Partial<PaymentModel>, transaction?: Transaction): Promise<PaymentModel> {
    return this.paymentModel.create(values, { transaction });
  }

  async sumPaid(invoiceId: string, transaction?: Transaction): Promise<number> {
    const amount = await this.paymentModel.sum('amount_micros', {
      where: { invoice_id: invoiceId, status: 'CONFIRMED' },
      transaction,
    });
    return Number(amount ?? 0);
  }

  updateInvoiceStatus(
    invoice: InvoiceModel,
    status: string,
    transaction?: Transaction,
  ): Promise<InvoiceModel> {
    return invoice.update({ status }, { transaction });
  }
}
