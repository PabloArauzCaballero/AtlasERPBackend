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
  /** CPM | CPC | CPA | ADJUSTMENT: qué se le está cobrando, deducido del motivo del asiento. */
  chargeBasis: string;
  amountMicros: string;
  billableEvents: string;
}

/** Producto del catálogo (`atlas_sales.billing_products`) que corresponde a una forma de cobro. */
export interface BillingProductRow {
  id: string;
  code: string;
  name: string;
  chargeBasis: string;
  sourceType: string;
  unitLabel: string;
}

interface MerchantAccountRow {
  merchantAccountId: string;
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

    /*
     * El agrupado abre por forma de cobro además de por campaña.
     *
     * El motivo del asiento ya trae el modelo de compra —`IMPRESSION_CPM`, `CLICK_CPC`— porque así
     * lo escribe el motor de entrega al registrar el evento. Sin abrir por ahí, alcance y clics
     * caían en una sola línea de factura y no había manera de decirle al comercio cuánto pagó por
     * cada cosa: era el mismo importe indistinto que antes se emitía como «ADJUSTMENT».
     */
    return this.ledgerModel.sequelize!.query<LedgerGroupRow>(
      `SELECT advertiser_id AS "advertiserId", campaign_id AS "campaignId", currency,
              CASE
                WHEN right(reason, 4) = '_CPM' THEN 'CPM'
                WHEN right(reason, 4) = '_CPC' THEN 'CPC'
                WHEN right(reason, 4) = '_CPA' THEN 'CPA'
                ELSE 'ADJUSTMENT'
              END AS "chargeBasis",
              SUM(amount_micros)::text AS "amountMicros", COUNT(*)::text AS "billableEvents"
       FROM ad_spend_ledger
       WHERE entry_type IN ('CHARGE','CREDIT','ADJUSTMENT','REFUND')
         AND occurred_at BETWEEN :periodStartDate AND :periodEndDate
         ${advertiserId ? 'AND advertiser_id = :advertiserId' : ''}
       GROUP BY advertiser_id, campaign_id, currency, 4
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

  /**
   * Catálogo de productos facturables, indexado por forma de cobro.
   *
   * Va en SQL crudo por la misma razón que la tarifa contratada: el catálogo vive en `atlas_sales`
   * y traer sus modelos al módulo de publicidad ataría el arranque de uno al del otro para leer
   * seis columnas.
   */
  async findBillingProductsByChargeBasis(
    transaction?: Transaction,
  ): Promise<Map<string, BillingProductRow>> {
    const rows = await this.invoiceModel.sequelize!.query<BillingProductRow>(
      `SELECT id, code, name, charge_basis AS "chargeBasis", source_type AS "sourceType",
              unit_label AS "unitLabel"
       FROM atlas_sales.billing_products
       WHERE status = 'ACTIVE'`,
      { type: QueryTypes.SELECT, transaction },
    );
    return new Map(rows.map((row) => [row.chargeBasis, row]));
  }

  /** Comercio dueño del anunciante, o `null` si el anunciante no cuelga de ninguno. */
  async findMerchantAccountId(
    advertiserId: string,
    transaction?: Transaction,
  ): Promise<string | null> {
    const [row] = await this.invoiceModel.sequelize!.query<MerchantAccountRow>(
      `SELECT merchant_account_id AS "merchantAccountId"
       FROM ad_advertiser_accounts
       WHERE id = :advertiserId AND merchant_account_id IS NOT NULL`,
      { type: QueryTypes.SELECT, replacements: { advertiserId }, transaction },
    );
    return row?.merchantAccountId ?? null;
  }

  /**
   * Traslada el consumo publicitario del periodo a la cuenta corriente del comercio.
   *
   * Es el paso que faltaba para que el gasto en publicidad llegara a la factura del partner: hasta
   * ahora se quedaba en la factura del módulo de anuncios, que el comercio no ve, mientras su
   * pantalla de facturación —que lee `atlas_sales.merchant_receivables`— solo mostraba comisiones.
   * El cargo nace con su producto, así que la factura que se emita después dirá «Alcance
   * publicitario» y no un tipo de origen.
   *
   * El importe va SIN impuesto, como el resto de los cargos: el IVA lo calcula la emisión de la
   * factura. `source_id` es la factura publicitaria del periodo: es lo que hace reconocible este
   * traslado y lo que impide cobrarlo dos veces, porque `uq_merchant_receivable_source` no admite
   * dos cargos con el mismo origen.
   */
  async createMerchantReceivableFromAdsInvoice(
    input: {
      merchantAccountId: string;
      productId: string;
      sourceType: string;
      adsInvoiceId: string;
      amountMicros: number;
      currency: string;
      dueDate: string;
    },
    transaction?: Transaction,
  ): Promise<void> {
    await this.invoiceModel.sequelize!.query(
      `INSERT INTO atlas_sales.merchant_receivables
         (account_id, invoice_id, source_type, source_id, product_id,
          amount_original, amount_open, currency, due_date, status)
       VALUES (:merchantAccountId, NULL, :sourceType, :adsInvoiceId, :productId,
               ROUND(:amountMicros::numeric / 1000000, 2),
               ROUND(:amountMicros::numeric / 1000000, 2),
               :currency, :dueDate, 'PENDING')`,
      {
        type: QueryTypes.INSERT,
        replacements: {
          merchantAccountId: input.merchantAccountId,
          productId: input.productId,
          sourceType: input.sourceType,
          adsInvoiceId: input.adsInvoiceId,
          amountMicros: input.amountMicros,
          currency: input.currency,
          dueDate: input.dueDate,
        },
        transaction,
      },
    );
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
