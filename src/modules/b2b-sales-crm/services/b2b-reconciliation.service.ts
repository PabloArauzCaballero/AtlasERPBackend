import { Injectable } from '@nestjs/common';
import { Op, Transaction } from 'sequelize';
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
