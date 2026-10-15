import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import { MessagingTraceService } from '../../../common/observability/messaging-trace.service';
import { toMinorUnits } from '../../../common/money/decimal-amount.util';
import { InstallmentStatus, PayableStatus, RecoveryStatus } from '../b2b-sales-crm.enums';
import type { DecidePayableSettlementDto, RejectPayableSettlementDto } from '../b2b-sales-crm.dtos';
import type { CoverageActor } from '../domain/coverage-actor';
import { SettlementStatus } from '../models/coverage.models';
import { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';
import { B2BSalesCrmUseCaseBase } from './b2b-sales-crm-use-case.base';
import { findCoreRef } from './core-installment-link.support';
import { writeOutboxEvent } from './coverage-ledger.support';
import { PayableSettlementLedger } from './payable-settlement.ledger';

/**
 * La segunda firma de la liquidación: confirmarla o rechazarla. Quien la registró no decide
 * (`FOUR_EYES_REQUIRED`).
 */
@Injectable()
export class PayableSettlementDecisionService extends B2BSalesCrmUseCaseBase {
  constructor(
    repository: B2BSalesCrmRepository,
    logger: PinoLoggerService,
    private readonly messaging: MessagingTraceService,
    private readonly ledger: PayableSettlementLedger,
  ) {
    super(repository, logger);
  }

  /**
   * Confirma la liquidación (segunda persona). Aquí, y sólo aquí, la CxP pasa a PAID, la cuota a
   * COVERED_BY_ATLAS y nace la CxC de recuperación por el importe liquidado, con su evento en el
   * outbox: todo en una transacción. Repetir la confirmación devuelve el mismo resultado.
   */
  async approvePayableSettlement(
    payableId: string,
    input: DecidePayableSettlementDto,
    actor: CoverageActor,
    now: Date = new Date(),
  ): Promise<Record<string, unknown>> {
    this.started('approvePayableSettlement');
    return this.repository.transaction(async (transaction) => {
      const payable = await this.ledger.lockPayable(payableId, transaction);
      const settlement = await this.ledger.findLiveSettlement(payable.id, transaction);
      if (!settlement) {
        throw new ConflictException({
          code: 'NO_SETTLEMENT',
          message: 'La CxP no tiene una liquidación registrada que confirmar.',
        });
      }
      if (settlement.status === SettlementStatus.CONFIRMED) {
        return this.ledger.settlementResult(payable, settlement, transaction, true);
      }
      if (settlement.registeredByUserId === actor.userId) {
        throw new ForbiddenException({
          code: 'FOUR_EYES_REQUIRED',
          message: 'Quien registró la liquidación no puede confirmarla: debe hacerlo otra persona.',
        });
      }
      if (payable.status !== PayableStatus.SCHEDULED && payable.status !== PayableStatus.DUE) {
        throw new ConflictException({
          code: 'PAYABLE_NOT_PAYABLE',
          message: `La CxP en estado ${payable.status} no se puede liquidar.`,
        });
      }
      // Se revalida con los datos de la fila: entre registrar y confirmar pudo cambiar la CxP.
      if (toMinorUnits(settlement.amount) !== toMinorUnits(payable.amount)) {
        throw new UnprocessableEntityException({
          code: 'SETTLEMENT_AMOUNT_MISMATCH',
          message: 'El importe liquidado ya no coincide con la CxP.',
        });
      }

      const installment = await this.repository.installments.findByPk(payable.installmentId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const purchase = await this.repository.purchases.findByPk(payable.purchaseId, {
        transaction,
      });
      if (!installment || !purchase) {
        throw new NotFoundException('Cuota o compra de la CxP no encontrada.');
      }

      await settlement.update(
        {
          status: SettlementStatus.CONFIRMED,
          decidedByUserId: actor.userId,
          decidedAt: now,
          decisionNote: input.note ?? null,
        },
        { transaction },
      );
      await payable.update(
        { status: PayableStatus.PAID, paidAt: settlement.paidAt },
        { transaction },
      );
      await installment.update({ status: InstallmentStatus.COVERED_BY_ATLAS }, { transaction });

      const recovery = await this.repository.recoveries.create(
        {
          consumerId: purchase.consumerId,
          purchaseId: purchase.id,
          installmentId: installment.id,
          merchantPayableId: payable.id,
          amountCoveredByAtlas: settlement.amount,
          amountRecovered: '0.00',
          coveragePaidAt: settlement.paidAt,
          recoveryStatus: RecoveryStatus.OPEN,
          currency: settlement.currency,
        },
        { transaction },
      );

      await writeOutboxEvent(
        this.repository.sequelize,
        this.messaging,
        {
          topic: 'b2b.coverage.settled',
          aggregateType: 'merchant_payable',
          aggregateId: payable.id,
          eventKey: `coverage-settled-${payable.id}`,
          payload: {
            payableId: payable.id,
            installmentId: installment.id,
            purchaseId: purchase.id,
            merchantAccountId: payable.accountId,
            consumerId: purchase.consumerId,
            settlementId: settlement.id,
            settlementReference: settlement.settlementReference,
            amount: settlement.amount,
            currency: settlement.currency,
            paidAt: settlement.paidAt,
            recoveryId: recovery.id,
            // P-14: identidad de la cuota en Core, o null si la compra no está ligada a un préstamo.
            coreRef: await findCoreRef(this.repository.sequelize, installment.id, transaction),
          },
        },
        transaction,
      );

      await this.ledger.recordSettlementAction(
        'APPROVE_PAYABLE_SETTLEMENT',
        payable.id,
        settlement.id,
        actor,
        { note: input.note ?? null },
        transaction,
      );
      return this.ledger.settlementResult(payable, settlement, transaction, false, recovery);
    });
  }

  /** Rechaza una liquidación mal cargada. La CxP sigue pendiente y la referencia queda libre. */
  async rejectPayableSettlement(
    payableId: string,
    input: RejectPayableSettlementDto,
    actor: CoverageActor,
  ): Promise<Record<string, unknown>> {
    this.started('rejectPayableSettlement');
    return this.repository.transaction(async (transaction) => {
      const payable = await this.ledger.lockPayable(payableId, transaction);
      const settlement = await this.ledger.findLiveSettlement(payable.id, transaction);
      if (!settlement || settlement.status !== SettlementStatus.PENDING_APPROVAL) {
        throw new ConflictException({
          code: 'NO_PENDING_SETTLEMENT',
          message: 'La CxP no tiene una liquidación pendiente que rechazar.',
        });
      }
      if (settlement.registeredByUserId === actor.userId) {
        throw new ForbiddenException({
          code: 'FOUR_EYES_REQUIRED',
          message: 'Quien registró la liquidación no puede decidir sobre ella.',
        });
      }
      await settlement.update(
        {
          status: SettlementStatus.REJECTED,
          decidedByUserId: actor.userId,
          decidedAt: new Date(),
          decisionNote: input.note,
        },
        { transaction },
      );
      await this.ledger.recordSettlementAction(
        'REJECT_PAYABLE_SETTLEMENT',
        payable.id,
        settlement.id,
        actor,
        { note: input.note },
        transaction,
      );
      return this.ledger.settlementResult(payable, settlement, transaction, false);
    });
  }
}
