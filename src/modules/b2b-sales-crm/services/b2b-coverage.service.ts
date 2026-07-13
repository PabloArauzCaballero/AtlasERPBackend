import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import { InstallmentStatus, PayableStatus, RecoveryStatus } from '../b2b-sales-crm.enums';
import type {
  ApplyRecoveryPaymentDto,
  MarkPayablePaidDto,
  ScheduleCoverageDto,
} from '../b2b-sales-crm.dtos';
import { toPayableResponse } from '../b2b-sales-crm.mapper';
import { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';
import { B2BSalesCrmUseCaseBase } from './b2b-sales-crm-use-case.base';

@Injectable()
export class B2BCoverageService extends B2BSalesCrmUseCaseBase {
  constructor(repository: B2BSalesCrmRepository, logger: PinoLoggerService) {
    super(repository, logger);
  }

  async scheduleCoverage(input: ScheduleCoverageDto): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BCoverageService.name, 'B2B CRM use case started', {
      useCase: 'scheduleCoverage',
    });
    return this.repository.transaction(async (transaction) => {
      const installment = await this.repository.installments.findByPk(input.installmentId, {
        include: [this.repository.purchases],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!installment?.purchase) {
        throw new NotFoundException('Cuota BNPL no encontrada.');
      }

      const existing = await this.repository.payables.findOne({
        where: { installmentId: input.installmentId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (existing) {
        throw new ConflictException('Ya existe una CxP ATLAS→comercio para esta cuota.');
      }

      await installment.update({ status: InstallmentStatus.OVERDUE }, { transaction });

      const payable = await this.repository.payables.create(
        {
          accountId: installment.purchase.merchantAccountId,
          purchaseId: installment.purchaseId,
          installmentId: installment.id,
          reason: input.reason,
          amount: installment.amount,
          scheduledPaymentDate: input.scheduledPaymentDate,
          status: PayableStatus.SCHEDULED,
        },
        { transaction },
      );

      return toPayableResponse(payable);
    });
  }

  async markPayablePaid(
    payableId: string,
    input: MarkPayablePaidDto,
  ): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BCoverageService.name, 'B2B CRM use case started', {
      useCase: 'markPayablePaid',
    });
    return this.repository.transaction(async (transaction) => {
      const payable = await this.repository.payables.findByPk(payableId, {
        include: [this.repository.purchases, this.repository.installments],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!payable?.purchase || !payable.installment) {
        throw new NotFoundException('CxP ATLAS→comercio no encontrada.');
      }

      if (payable.status === PayableStatus.PAID) {
        throw new ConflictException('La CxP ya fue pagada.');
      }

      if (payable.status === PayableStatus.CANCELLED) {
        throw new ConflictException('No se puede pagar una CxP cancelada.');
      }

      await payable.update({ status: PayableStatus.PAID, paidAt: input.paidAt }, { transaction });
      await payable.installment.update(
        { status: InstallmentStatus.COVERED_BY_ATLAS },
        { transaction },
      );

      const recovery = await this.repository.recoveries.create(
        {
          consumerId: payable.purchase.consumerId,
          purchaseId: payable.purchaseId,
          installmentId: payable.installmentId,
          merchantPayableId: payable.id,
          amountCoveredByAtlas: payable.amount,
          amountRecovered: '0.00',
          coveragePaidAt: input.paidAt,
          recoveryStatus: RecoveryStatus.OPEN,
        },
        { transaction },
      );

      return {
        payable: toPayableResponse(payable),
        recovery: {
          id: recovery.id,
          consumerId: recovery.consumerId,
          merchantPayableId: recovery.merchantPayableId,
          amountCoveredByAtlas: recovery.amountCoveredByAtlas,
          amountRecovered: recovery.amountRecovered,
          recoveryStatus: recovery.recoveryStatus,
        },
      };
    });
  }

  async applyRecoveryPayment(
    recoveryId: string,
    input: ApplyRecoveryPaymentDto,
  ): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BCoverageService.name, 'B2B CRM use case started', {
      useCase: 'applyRecoveryPayment',
    });
    return this.repository.transaction(async (transaction) => {
      const recovery = await this.repository.recoveries.findByPk(recoveryId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!recovery) {
        throw new NotFoundException('CxC de recuperación no encontrada.');
      }

      const nextRecovered = this.roundMoney(this.toNumber(recovery.amountRecovered) + input.amount);
      const covered = this.toNumber(recovery.amountCoveredByAtlas);

      if (nextRecovered > covered) {
        throw new ConflictException('El pago de recuperación excede el monto cubierto por ATLAS.');
      }

      await recovery.update(
        {
          amountRecovered: nextRecovered.toFixed(2),
          recoveryStatus:
            nextRecovered === covered
              ? RecoveryStatus.RECOVERED
              : RecoveryStatus.PARTIALLY_RECOVERED,
        },
        { transaction },
      );

      return {
        id: recovery.id,
        amountCoveredByAtlas: recovery.amountCoveredByAtlas,
        amountRecovered: recovery.amountRecovered,
        recoveryStatus: recovery.recoveryStatus,
      };
    });
  }
}
