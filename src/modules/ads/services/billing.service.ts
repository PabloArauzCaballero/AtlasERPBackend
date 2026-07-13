import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { PinoLogger } from 'nestjs-pino';
import { env } from '../../../config/env';
import { BillingRepository, type LedgerGroupRow } from '../repositories/billing.repository';
import { AdsAuditService } from './audit.service';
import { serializeModel } from '../ads.mappers';
import type { ActorContext } from '../ads.types';
import type { PeriodCloseDto, RegisterPaymentDto } from '../ads.dtos';

interface LedgerInvoiceGroup {
  advertiserId: string;
  currency: string;
  lines: LedgerGroupRow[];
}

@Injectable()
export class AdsBillingService {
  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly billingRepository: BillingRepository,
    private readonly auditService: AdsAuditService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AdsBillingService.name);
  }

  async closePeriod(input: PeriodCloseDto, actor: ActorContext) {
    const ledgerGroups = await this.billingRepository.getLedgerGroups(
      input.periodStart,
      input.periodEnd,
      input.advertiserId,
    );
    if (ledgerGroups.length === 0) {
      throw new ConflictException({
        code: 'NO_LEDGER_TO_BILL',
        message: 'No existe ledger facturable para el periodo solicitado.',
      });
    }

    const invoiceGroups = this.groupLedgerForInvoices(ledgerGroups);
    const advertiserIds = [...new Set(invoiceGroups.map((group) => group.advertiserId))];

    return this.sequelize.transaction(async (transaction) => {
      await this.billingRepository.assertPeriodIsNotClosed(
        advertiserIds,
        input.periodStart,
        input.periodEnd,
        transaction,
      );

      const invoices: Array<{
        invoiceId: string;
        advertiserId: string;
        currency: string;
        totalMicros: number;
        auditId: string;
      }> = [];
      for (const group of invoiceGroups) {
        const subtotalMicros = group.lines.reduce(
          (sum, line) => sum + Number(line.amountMicros),
          0,
        );
        const taxMicros = Math.round(subtotalMicros * env.ADS_BILLING_TAX_RATE);
        const totalMicros = subtotalMicros + taxMicros;
        const billingProfile = await this.billingRepository.findDefaultBillingProfile(
          group.advertiserId,
          transaction,
        );
        if (!billingProfile) {
          throw new NotFoundException({
            code: 'BILLING_PROFILE_NOT_FOUND',
            message: `El anunciante ${group.advertiserId} no tiene perfil fiscal activo.`,
          });
        }

        const invoice = await this.billingRepository.createInvoice(
          {
            advertiserId: group.advertiserId,
            billingProfileId: billingProfile.id,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            currency: group.currency,
            subtotalMicros,
            taxMicros,
            totalMicros,
            status: 'DRAFT',
          },
          transaction,
        );

        for (const line of group.lines) {
          const amountMicros = Number(line.amountMicros);
          await this.billingRepository.createInvoiceLine(
            {
              invoiceId: invoice.id,
              campaignId: line.campaignId,
              description: `Consumo publicitario ${input.periodStart} a ${input.periodEnd}`,
              pricingModel: 'ADJUSTMENT',
              quantity: line.billableEvents,
              unitPriceMicros: amountMicros,
              amountMicros,
            },
            transaction,
          );
        }

        const audit = await this.auditService.record({
          actor,
          entityType: 'INVOICE',
          entityId: invoice.id,
          action: 'CREATE_PERIOD_CLOSE_INVOICE',
          reason: `Cierre de periodo ${input.periodStart} - ${input.periodEnd}`,
          severity: 'HIGH',
          after: serializeModel(invoice),
          transaction,
        });
        invoices.push({
          invoiceId: invoice.id,
          advertiserId: group.advertiserId,
          currency: group.currency,
          totalMicros,
          auditId: audit.auditId,
        });
      }
      this.logger.info({ count: invoices.length }, 'Billing period closed');
      return { invoices };
    });
  }

  async registerPayment(invoiceId: string, input: RegisterPaymentDto, actor: ActorContext) {
    return this.sequelize.transaction(async (transaction) => {
      const invoice = await this.billingRepository.findInvoiceOrThrow(invoiceId, transaction);
      if (['VOID', 'PAID'].includes(invoice.status)) {
        throw new ConflictException({
          code: 'INVOICE_PAYMENT_NOT_ALLOWED',
          message: 'La factura no permite registrar pagos adicionales.',
        });
      }
      if (invoice.currency !== input.currency) {
        throw new ConflictException({
          code: 'INVOICE_CURRENCY_MISMATCH',
          message: 'La moneda del pago no coincide con la moneda de la factura.',
        });
      }

      const currentPaidMicros = await this.billingRepository.sumPaid(invoiceId, transaction);
      const nextPaidMicros = currentPaidMicros + input.amountMicros;
      if (nextPaidMicros > Number(invoice.totalMicros)) {
        throw new ConflictException({
          code: 'PAYMENT_EXCEEDS_INVOICE_TOTAL',
          message: 'El pago excede el saldo pendiente de la factura.',
        });
      }

      const payment = await this.billingRepository.createPayment(
        {
          invoiceId,
          amountMicros: input.amountMicros,
          currency: input.currency,
          paymentMethod: input.paymentMethod,
          externalReference: input.reference ?? null,
          paidAt: new Date(`${input.paymentDate}T12:00:00.000Z`),
          status: 'CONFIRMED',
        },
        transaction,
      );
      const nextStatus = nextPaidMicros >= Number(invoice.totalMicros) ? 'PAID' : 'PARTIALLY_PAID';
      await this.billingRepository.updateInvoiceStatus(invoice, nextStatus, transaction);
      const audit = await this.auditService.record({
        actor,
        entityType: 'INVOICE',
        entityId: invoiceId,
        action: 'REGISTER_PAYMENT',
        reason: `Pago registrado por ${input.amountMicros} ${input.currency}`,
        severity: 'HIGH',
        after: serializeModel(payment),
        transaction,
      });
      return { payment: serializeModel(payment), invoiceStatus: nextStatus, ...audit };
    });
  }

  private groupLedgerForInvoices(ledgerGroups: LedgerGroupRow[]): LedgerInvoiceGroup[] {
    const groups = new Map<string, LedgerInvoiceGroup>();
    for (const row of ledgerGroups) {
      const key = `${row.advertiserId}:${row.currency}`;
      const existing = groups.get(key);
      if (existing) {
        existing.lines.push(row);
      } else {
        groups.set(key, { advertiserId: row.advertiserId, currency: row.currency, lines: [row] });
      }
    }
    return Array.from(groups.values());
  }
}
