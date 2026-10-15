import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { Transaction } from 'sequelize';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import { MessagingTraceService } from '../../../common/observability/messaging-trace.service';
import { fromMinorUnits, toMinorUnits } from '../../../common/money/decimal-amount.util';
import { RecoveryStatus } from '../b2b-sales-crm.enums';
import type { ApplyRecoveryPaymentDto, ReverseRecoveryMovementDto } from '../b2b-sales-crm.dtos';
import { toMovementResponse, toRecoveryResult } from '../coverage.mapper';
import type { CoverageActor } from '../domain/coverage-actor';
import { isSameRecoveryPayment, recoveryStatusFor } from '../domain/consumer-recovery';
import type { ConsumerRecoveryReceivableModel } from '../models/b2b-sales-crm.models';
import { ConsumerRecoveryMovementModel, RecoveryMovementType } from '../models/coverage.models';
import { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';
import { B2BSalesCrmUseCaseBase } from './b2b-sales-crm-use-case.base';
import { findCoreRef } from './core-installment-link.support';
import { mapUniqueViolation, writeOutboxEvent } from './coverage-ledger.support';

/**
 * Recuperación contra el consumidor de lo que ATLAS cubrió al comercio: cada cobro es un
 * movimiento con referencia única; repetirlo no suma, excederse se rechaza y el reverso compensa
 * sin borrar.
 */
@Injectable()
export class ConsumerRecoveryService extends B2BSalesCrmUseCaseBase {
  constructor(
    repository: B2BSalesCrmRepository,
    logger: PinoLoggerService,
    private readonly messaging: MessagingTraceService,
    @InjectModel(ConsumerRecoveryMovementModel)
    private readonly recoveryMovements: typeof ConsumerRecoveryMovementModel,
  ) {
    super(repository, logger);
  }

  async applyRecoveryPayment(
    recoveryId: string,
    input: ApplyRecoveryPaymentDto,
    actor?: CoverageActor,
  ): Promise<Record<string, unknown>> {
    this.started('applyRecoveryPayment');
    return mapUniqueViolation('La referencia de pago ya está registrada.', () =>
      this.repository.transaction(async (transaction) => {
        const recovery = await this.lockRecovery(recoveryId, transaction);

        const existing = await this.recoveryMovements.findOne({
          where: { paymentReference: input.paymentReference },
          transaction,
        });
        if (existing) {
          const same = isSameRecoveryPayment(existing, {
            recoveryId: recovery.id,
            paymentType: RecoveryMovementType.PAYMENT,
            amount: input.amount,
            currency: input.currency,
          });
          if (!same) {
            throw new ConflictException({
              code: 'DUPLICATE_REFERENCE',
              message: 'La referencia de pago ya se usó para otro cobro.',
            });
          }
          return toRecoveryResult(recovery, existing, true);
        }

        if (input.currency !== recovery.currency) {
          throw new UnprocessableEntityException({
            code: 'CURRENCY_MISMATCH',
            message: `La recuperación es en ${recovery.currency}.`,
          });
        }
        if (recovery.recoveryStatus === RecoveryStatus.WRITTEN_OFF) {
          throw new ConflictException({
            code: 'RECOVERY_WRITTEN_OFF',
            message: 'La recuperación está castigada.',
          });
        }

        const coveredMinor = toMinorUnits(recovery.amountCoveredByAtlas);
        const nextMinor = toMinorUnits(recovery.amountRecovered) + toMinorUnits(input.amount);
        if (nextMinor > coveredMinor) {
          throw new ConflictException({
            code: 'RECOVERY_OVERPAYMENT',
            message: 'El pago de recuperación excede el monto cubierto por ATLAS.',
          });
        }

        const movement = await this.recoveryMovements.create(
          {
            recoveryId: recovery.id,
            installmentId: recovery.installmentId,
            movementType: RecoveryMovementType.PAYMENT,
            paymentReference: input.paymentReference,
            amount: input.amount,
            currency: input.currency,
            receivedAt: input.receivedAt ?? new Date(),
            recordedByUserId: actor?.userId ?? null,
          },
          { transaction },
        );
        await this.updateRecoveredAmount(recovery, nextMinor, coveredMinor, transaction);
        await this.writeMovementEvent(
          'b2b.recovery.payment_applied',
          recovery,
          movement,
          transaction,
        );
        return toRecoveryResult(recovery, movement, false);
      }),
    );
  }

  /** Devolución o reverso de un cobro: movimiento compensatorio; el original se conserva. */
  async reverseRecoveryMovement(
    recoveryId: string,
    movementId: string,
    input: ReverseRecoveryMovementDto,
    actor: CoverageActor,
  ): Promise<Record<string, unknown>> {
    this.started('reverseRecoveryMovement');
    return mapUniqueViolation('La referencia del reverso ya está registrada.', () =>
      this.repository.transaction(async (transaction) => {
        const recovery = await this.lockRecovery(recoveryId, transaction);
        const original = await this.recoveryMovements.findOne({
          where: { id: movementId, recoveryId: recovery.id },
          transaction,
        });
        if (!original || original.movementType !== RecoveryMovementType.PAYMENT) {
          throw new NotFoundException('Cobro de recuperación no encontrado en esta CxC.');
        }

        const previous = await this.recoveryMovements.findOne({
          where: { reversesMovementId: original.id },
          transaction,
        });
        if (previous) {
          if (previous.paymentReference === input.reversalReference) {
            return toRecoveryResult(recovery, previous, true);
          }
          throw new ConflictException({
            code: 'ALREADY_REVERSED',
            message: 'Ese cobro ya fue revertido.',
          });
        }
        const clash = await this.recoveryMovements.findOne({
          where: { paymentReference: input.reversalReference },
          transaction,
        });
        if (clash) {
          throw new ConflictException({
            code: 'DUPLICATE_REFERENCE',
            message: 'La referencia del reverso ya se usó.',
          });
        }

        const coveredMinor = toMinorUnits(recovery.amountCoveredByAtlas);
        const nextMinor = toMinorUnits(recovery.amountRecovered) - toMinorUnits(original.amount);
        if (nextMinor < 0n) {
          throw new ConflictException({
            code: 'RECOVERY_NEGATIVE',
            message: 'El reverso dejaría la recuperación en negativo.',
          });
        }

        const movement = await this.recoveryMovements.create(
          {
            recoveryId: recovery.id,
            installmentId: recovery.installmentId,
            movementType: RecoveryMovementType.REVERSAL,
            paymentReference: input.reversalReference,
            amount: original.amount,
            currency: original.currency,
            reversesMovementId: original.id,
            receivedAt: new Date(),
            recordedByUserId: actor.userId,
            reason: input.reason,
          },
          { transaction },
        );
        await this.updateRecoveredAmount(recovery, nextMinor, coveredMinor, transaction);
        await this.writeMovementEvent(
          'b2b.recovery.payment_reversed',
          recovery,
          movement,
          transaction,
        );
        return toRecoveryResult(recovery, movement, false);
      }),
    );
  }

  async listRecoveryMovements(recoveryId: string): Promise<Record<string, unknown>[]> {
    const rows = await this.recoveryMovements.findAll({
      where: { recoveryId },
      order: [['createdAt', 'ASC']],
    });
    return rows.map(toMovementResponse);
  }

  private async lockRecovery(
    recoveryId: string,
    transaction: Transaction,
  ): Promise<ConsumerRecoveryReceivableModel> {
    const recovery = await this.repository.recoveries.findByPk(recoveryId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!recovery) throw new NotFoundException('CxC de recuperación no encontrada.');
    return recovery;
  }

  private async updateRecoveredAmount(
    recovery: ConsumerRecoveryReceivableModel,
    nextMinor: bigint,
    coveredMinor: bigint,
    transaction: Transaction,
  ): Promise<void> {
    await recovery.update(
      {
        amountRecovered: fromMinorUnits(nextMinor),
        recoveryStatus: recoveryStatusFor(nextMinor, coveredMinor),
      },
      { transaction },
    );
  }

  private async writeMovementEvent(
    topic: string,
    recovery: ConsumerRecoveryReceivableModel,
    movement: ConsumerRecoveryMovementModel,
    transaction: Transaction,
  ): Promise<void> {
    const coreRef = await findCoreRef(
      this.repository.sequelize,
      recovery.installmentId,
      transaction,
    );
    return writeOutboxEvent(
      this.repository.sequelize,
      this.messaging,
      {
        topic,
        aggregateType: 'consumer_recovery',
        aggregateId: recovery.id,
        eventKey: `recovery-movement-${movement.id}`,
        payload: {
          recoveryId: recovery.id,
          installmentId: recovery.installmentId,
          consumerId: recovery.consumerId,
          movementId: movement.id,
          movementType: movement.movementType,
          paymentReference: movement.paymentReference,
          amount: movement.amount,
          currency: movement.currency,
          amountRecovered: recovery.amountRecovered,
          recoveryStatus: recovery.recoveryStatus,
          coreRef,
        },
      },
      transaction,
    );
  }
}
