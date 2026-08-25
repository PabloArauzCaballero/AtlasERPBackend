import { Injectable } from '@nestjs/common';
import { Op, Transaction, WhereOptions } from 'sequelize';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import type { AuthUser } from '../../../common/types/auth-context.types';
import {
  InstallmentStatus,
  PayableStatus,
  PurchaseStatus,
  ReceivableStatus,
  TermType,
} from '../b2b-sales-crm.enums';
import type { RunReconciliationDto } from '../b2b-sales-crm.dtos';
import { toReconciliationRunResponse } from '../b2b-sales-crm.mapper';
import { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';
import { B2BSalesCrmUseCaseBase } from './b2b-sales-crm-use-case.base';

@Injectable()
export class B2BReconciliationService extends B2BSalesCrmUseCaseBase {
  constructor(repository: B2BSalesCrmRepository, logger: PinoLoggerService) {
    super(repository, logger);
  }

  /**
   * Las piezas sueltas de la conciliacion, para poder ELEGIRLAS.
   *
   * Faltaban las lecturas, y por eso la pantalla de conciliacion pedia tres uuids tecleados —cuota,
   * payable y recuperacion—. Nadie los conoce: solo se obtenian copiandolos de la respuesta de otra
   * llamada, asi que el flujo era inoperable para quien tenia que usarlo.
   */
  async listInstallments(): Promise<Record<string, unknown>[]> {
    const rows = await this.repository.installments.findAll({
      order: [['dueDate', 'ASC']],
      limit: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      purchaseId: row.purchaseId,
      installmentNumber: row.installmentNumber,
      dueDate: row.dueDate,
      amount: row.amount,
      status: row.status,
    }));
  }

  /** Facturas emitidas al comercio, por numero y estado: es como se las busca para contabilizar. */
  /**
   * Lo que el comercio le debe a Atlas por usar el servicio: la comision de cada venta.
   *
   * Cada venta BNPL genera una cuenta por cobrar de tipo `MDR` —la comision calculada con la regla
   * que le tocaba a esa venta—. Aqui se suman: cuanto se le cobro en total, cuanto sigue abierto y
   * el detalle venta a venta.
   *
   * `amountOpen` y no `amountOriginal` es lo que de verdad debe: una comision ya facturada y pagada
   * dejo de ser deuda, y presentarla como pendiente haria que el comercio provisionara dos veces
   * el mismo dinero.
   */
  async listCommissions(accountId: string): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BReconciliationService.name, 'B2B CRM use case started', {
      useCase: 'listCommissions',
    });
    const rows = await this.repository.receivables.findAll({
      where: { accountId, sourceType: 'MDR' } as WhereOptions,
      order: [['issued_at', 'DESC']],
      limit: 200,
    });

    const total = rows.reduce((suma, fila) => suma + Number(fila.amountOriginal), 0);
    const abierto = rows.reduce((suma, fila) => suma + Number(fila.amountOpen), 0);

    return {
      summary: {
        chargedTotal: total.toFixed(2),
        owedToAtlas: abierto.toFixed(2),
        settled: (total - abierto).toFixed(2),
        salesCharged: rows.length,
      },
      commissions: rows.map((fila) => ({
        id: fila.id,
        purchaseId: fila.sourceId,
        amountCharged: fila.amountOriginal,
        amountOpen: fila.amountOpen,
        currency: fila.currency,
        issuedAt: fila.issuedAt,
        dueDate: fila.dueDate,
        status: fila.status,
      })),
    };
  }

  async listMerchantInvoices(): Promise<Record<string, unknown>[]> {
    const rows = await this.repository.invoices.findAll({
      order: [['invoiceDate', 'DESC']],
      limit: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      accountId: row.accountId,
      invoiceDate: row.invoiceDate,
      totalAmount: row.totalAmount,
      status: row.status,
    }));
  }

  async listPayables(): Promise<Record<string, unknown>[]> {
    const rows = await this.repository.payables.findAll({ order: [['id', 'DESC']], limit: 200 });
    return rows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      amount: row.amount,
      status: row.status,
      scheduledPaymentDate: row.scheduledPaymentDate,
    }));
  }

  async listRecoveries(): Promise<Record<string, unknown>[]> {
    const rows = await this.repository.recoveries.findAll({ order: [['id', 'DESC']], limit: 200 });
    return rows.map((row) => ({
      id: row.id,
      consumerId: row.consumerId,
      amountCoveredByAtlas: row.amountCoveredByAtlas,
      amountRecovered: row.amountRecovered,
      recoveryStatus: row.recoveryStatus,
      daysPastDue: row.daysPastDue,
    }));
  }

  async runReconciliation(
    input: RunReconciliationDto,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BReconciliationService.name, 'B2B CRM use case started', {
      useCase: 'runReconciliation',
    });
    return this.repository.transaction(async (transaction) => {
      const run = await this.repository.reconciliationRuns.create(
        {
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          status: 'RUNNING',
          startedByUserId: user.sub,
        },
        { transaction },
      );

      const confirmedPurchases = await this.repository.purchases.findAll({
        where: {
          status: PurchaseStatus.CONFIRMED,
          purchaseDate: {
            [Op.between]: [
              new Date(`${input.periodStart}T00:00:00Z`),
              new Date(`${input.periodEnd}T23:59:59Z`),
            ],
          },
        },
        transaction,
      });

      for (const purchase of confirmedPurchases) {
        const mdrReceivable = await this.repository.receivables.findOne({
          where: { sourceType: TermType.MDR, sourceId: purchase.id },
          transaction,
        });

        if (!mdrReceivable) {
          await this.createReconciliationItem(
            run.id,
            'MDR',
            'HIGH',
            purchase.merchantAccountId,
            purchase.id,
            'Compra confirmada sin cargo MDR B2B.',
            transaction,
          );
        }
      }

      const overdueReceivables = await this.repository.receivables.findAll({
        where: {
          status: { [Op.in]: [ReceivableStatus.PENDING, ReceivableStatus.PARTIALLY_PAID] },
          dueDate: { [Op.lt]: input.periodEnd },
        },
        transaction,
      });

      for (const receivable of overdueReceivables) {
        await this.createReconciliationItem(
          run.id,
          'CXC_B2B',
          'MEDIUM',
          receivable.accountId,
          receivable.id,
          'CxC B2B vencida sin pago completo.',
          transaction,
        );
      }

      const overdueInstallments = await this.repository.installments.findAll({
        where: { status: InstallmentStatus.OVERDUE, dueDate: { [Op.lte]: input.periodEnd } },
        include: [this.repository.purchases],
        transaction,
      });

      for (const installment of overdueInstallments) {
        const payable = await this.repository.payables.findOne({
          where: { installmentId: installment.id },
          transaction,
        });
        if (!payable) {
          await this.createReconciliationItem(
            run.id,
            'CXP_MERCHANT',
            'HIGH',
            installment.purchase?.merchantAccountId ?? null,
            installment.id,
            'Cuota vencida sin CxP ATLAS→comercio programada.',
            transaction,
          );
        }
      }

      const paidPayables = await this.repository.payables.findAll({
        where: {
          status: PayableStatus.PAID,
          paidAt: {
            [Op.between]: [
              new Date(`${input.periodStart}T00:00:00Z`),
              new Date(`${input.periodEnd}T23:59:59Z`),
            ],
          },
        },
        transaction,
      });
      for (const payable of paidPayables) {
        const recovery = await this.repository.recoveries.findOne({
          where: { merchantPayableId: payable.id },
          transaction,
        });
        if (!recovery) {
          await this.createReconciliationItem(
            run.id,
            'RECOVERY',
            'HIGH',
            payable.accountId,
            payable.id,
            'CxP pagada sin CxC de recuperación contra consumidor.',
            transaction,
          );
        }
      }

      const openItems = await this.repository.reconciliationItems.count({
        where: { runId: run.id, status: 'OPEN' },
        transaction,
      });
      await run.update(
        { status: openItems > 0 ? 'OPEN_ITEMS' : 'COMPLETED', completedAt: new Date() },
        { transaction },
      );
      const created = await this.repository.findReconciliationRunWithItems(run.id, transaction);
      return toReconciliationRunResponse(
        this.requireEntity(created, 'Conciliación no encontrada luego de crear.'),
      );
    });
  }

  private async createReconciliationItem(
    runId: string,
    itemType: string,
    severity: string,
    accountId: string | null,
    sourceRef: string,
    description: string,
    transaction: Transaction,
  ): Promise<void> {
    await this.repository.reconciliationItems.create(
      { runId, itemType, severity, accountId, sourceRef, description, status: 'OPEN' },
      { transaction },
    );
  }
}
