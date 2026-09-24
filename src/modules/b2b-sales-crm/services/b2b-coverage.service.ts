import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import type { Transaction } from 'sequelize';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import { MessagingTraceService } from '../../../common/observability/messaging-trace.service';
import { fromMinorUnits, toMinorUnits } from '../../../common/money/decimal-amount.util';
import { businessDate } from '../../../common/time/business-date';
import { InstallmentStatus, PayableStatus, RecoveryStatus } from '../b2b-sales-crm.enums';
import type {
  ApplyRecoveryPaymentDto,
  CancelPayableDto,
  DecidePayableSettlementDto,
  MarkPayablePaidDto,
  RejectPayableSettlementDto,
  ReverseRecoveryMovementDto,
  ScheduleCoverageDto,
} from '../b2b-sales-crm.dtos';
import { toPayableResponse } from '../b2b-sales-crm.mapper';
import { evaluateCoverageEligibility } from '../domain/coverage-eligibility';
import type {
  ConsumerRecoveryReceivableModel,
  MerchantPayableModel,
} from '../models/b2b-sales-crm.models';
import {
  ConsumerRecoveryMovementModel,
  CoverageReviewItemModel,
  CoverageReviewResolution,
  MerchantPayableSettlementModel,
  RecoveryMovementType,
  SettlementStatus,
} from '../models/coverage.models';
import type { CoverageReviewReason } from '../models/coverage.models';
import { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';
import { B2BSalesCrmUseCaseBase } from './b2b-sales-crm-use-case.base';
import {
  findEvidenceFileStatus,
  mapUniqueViolation,
  writeOutboxEvent,
} from './coverage-ledger.support';
import { toReviewItemResponse } from './coverage-review.service';

/** Quién actúa: el `sub` del token, uuid del usuario interno. */
export interface CoverageActor {
  userId: string;
}

/** Tolerancia de reloj para una fecha de pago declarada «ahora». */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * Cobertura ATLAS→comercio de cuotas BNPL impagas y recuperación posterior contra el consumidor.
 *
 * Tres transiciones con dinero, y cada una exige su prueba:
 *  1. `scheduleCoverage`: sólo una cuota vencida, impaga y sin cobertura viva, por su SALDO. Lo
 *     ambiguo (aviso de pago sin confirmar, contrato no activo) va a la cola de revisión.
 *  2. `markPayablePaid` + `approvePayableSettlement`: la CxP se da por pagada con una liquidación
 *     identificada (referencia única, importe, moneda, beneficiario, fecha, evidencia) que registra
 *     una persona y confirma OTRA. Sólo entonces nace la CxC de recuperación, en la misma
 *     transacción que el cambio de cuota y el evento del outbox.
 *  3. `applyRecoveryPayment` / `reverseRecoveryMovement`: cada cobro es un movimiento con
 *     referencia única; repetirlo no suma, excederse se rechaza y el reverso compensa sin borrar.
 *
 * Todo el dinero se opera en unidades menores (`bigint`) con `decimal-amount.util`; nada pasa por
 * `number`.
 */
@Injectable()
export class B2BCoverageService extends B2BSalesCrmUseCaseBase {
  constructor(
    repository: B2BSalesCrmRepository,
    logger: PinoLoggerService,
    private readonly messaging: MessagingTraceService,
    @InjectModel(MerchantPayableSettlementModel)
    private readonly settlements: typeof MerchantPayableSettlementModel,
    @InjectModel(ConsumerRecoveryMovementModel)
    private readonly recoveryMovements: typeof ConsumerRecoveryMovementModel,
    @InjectModel(CoverageReviewItemModel)
    private readonly reviewItems: typeof CoverageReviewItemModel,
  ) {
    super(repository, logger);
  }

  // ------------------------------------------------------------------------------------------
  // 1. Elegibilidad y programación
  // ------------------------------------------------------------------------------------------

  async scheduleCoverage(
    input: ScheduleCoverageDto,
    actor: CoverageActor,
    now: Date = new Date(),
  ): Promise<Record<string, unknown>> {
    this.started('scheduleCoverage');
    return mapUniqueViolation('Ya existe una CxP ATLAS→comercio vigente para esta cuota.', () =>
      this.repository.transaction(async (transaction) => {
        // El lock va SOLO sobre la cuota: dos solicitudes simultáneas se serializan aquí y la
        // segunda ve la CxP de la primera. Sin `include`, porque `FOR UPDATE` no se admite en el
        // lado anulable de un LEFT JOIN.
        const installment = await this.repository.installments.findByPk(input.installmentId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!installment) throw new NotFoundException('Cuota BNPL no encontrada.');

        const purchase = await this.repository.purchases.findByPk(installment.purchaseId, {
          transaction,
        });
        if (!purchase) throw new NotFoundException('Compra BNPL de la cuota no encontrada.');

        const version = await this.repository.contractVersions.findByPk(
          purchase.contractVersionId,
          { transaction, include: [this.repository.contracts] },
        );
        const livePayable = await this.repository.payables.findOne({
          where: {
            installmentId: installment.id,
            status: { [Op.ne]: PayableStatus.CANCELLED },
          },
          transaction,
        });
        const notices = await this.repository.consumerPaymentsToMerchant.findAll({
          attributes: ['id', 'status', 'amount'],
          where: { installmentId: installment.id },
          transaction,
        });
        const today = businessDate(now);

        const outcome = evaluateCoverageEligibility({
          installment: {
            id: installment.id,
            status: installment.status,
            dueDate: installment.dueDate,
            amount: installment.amount,
          },
          purchaseStatus: purchase.status,
          contract: version?.contract
            ? {
                id: version.contract.id,
                status: version.contract.status,
                versionId: version.id,
                versionNumber: version.versionNumber,
              }
            : null,
          notices: notices.map((n) => ({ id: n.id, status: n.status, amount: n.amount })),
          hasLivePayable: livePayable !== null,
          businessDate: today,
        });

        if (outcome.kind === 'REJECTED') {
          // Nada se escribió: la transacción sólo leyó y bloqueó.
          throw new ConflictException({ code: outcome.code, message: outcome.message });
        }

        if (outcome.kind === 'REVIEW') {
          const item = await this.openReviewItem(
            installment.id,
            outcome.reason,
            { ...outcome.evidence, requestedReason: input.reason },
            actor.userId,
            transaction,
          );
          return {
            outcome: 'REVIEW_REQUIRED',
            installmentId: installment.id,
            reason: outcome.reason,
            message: outcome.message,
            reviewItem: toReviewItemResponse(item),
          };
        }

        if (installment.status === InstallmentStatus.SCHEDULED) {
          await installment.update({ status: InstallmentStatus.OVERDUE }, { transaction });
        }

        const payable = await this.repository.payables.create(
          {
            accountId: purchase.merchantAccountId,
            purchaseId: purchase.id,
            installmentId: installment.id,
            reason: input.reason,
            amount: outcome.eligibleAmount,
            currency: 'BOB',
            scheduledPaymentDate: input.scheduledPaymentDate,
            status: PayableStatus.SCHEDULED,
            requestedByUserId: actor.userId,
            contractVersionId: purchase.contractVersionId,
            businessDate: today,
            eligibilityEvidence: outcome.evidence,
          },
          { transaction },
        );

        // Lo que estaba en la cola por esta cuota queda resuelto por la propia cobertura.
        await this.reviewItems.update(
          {
            status: 'RESOLVED',
            resolution: CoverageReviewResolution.COVERAGE_SCHEDULED,
            resolvedAt: now,
            resolvedByUserId: actor.userId,
            resolutionNote: `Cobertura programada (CxP ${payable.id}).`,
          },
          { where: { installmentId: installment.id, status: 'OPEN' }, transaction },
        );

        return { outcome: 'SCHEDULED', ...toCoveragePayableResponse(payable) };
      }),
    );
  }

  /** Reverso de una cobertura AÚN NO liquidada: la CxP queda CANCELLED y la cuota puede reabrirse. */
  async cancelPayable(
    payableId: string,
    input: CancelPayableDto,
    actor: CoverageActor,
  ): Promise<Record<string, unknown>> {
    this.started('cancelPayable');
    return this.repository.transaction(async (transaction) => {
      const payable = await this.lockPayable(payableId, transaction);
      if (payable.status === PayableStatus.CANCELLED) {
        return { outcome: 'CANCELLED', replayed: true, ...toCoveragePayableResponse(payable) };
      }
      if (payable.status === PayableStatus.PAID) {
        throw new ConflictException({
          code: 'PAYABLE_ALREADY_PAID',
          message:
            'La CxP ya fue liquidada: no se cancela, se revierte con un movimiento aprobado.',
        });
      }
      const live = await this.findLiveSettlement(payable.id, transaction);
      if (live) {
        throw new ConflictException({
          code: 'SETTLEMENT_IN_PROGRESS',
          message: 'Hay una liquidación registrada para esta CxP: recházala antes de cancelar.',
        });
      }
      await payable.update(
        {
          status: PayableStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledByUserId: actor.userId,
          cancellationReason: input.reason,
        },
        { transaction },
      );
      return { outcome: 'CANCELLED', replayed: false, ...toCoveragePayableResponse(payable) };
    });
  }

  // ------------------------------------------------------------------------------------------
  // 2. Liquidación al comercio con doble control
  // ------------------------------------------------------------------------------------------

  /** Registra la liquidación. NO da por pagada la CxP: queda pendiente de una segunda persona. */
  async markPayablePaid(
    payableId: string,
    input: MarkPayablePaidDto,
    actor: CoverageActor,
    now: Date = new Date(),
  ): Promise<Record<string, unknown>> {
    this.started('markPayablePaid');
    return mapUniqueViolation(
      'La referencia de liquidación ya está usada, o la CxP ya tiene una liquidación registrada.',
      () =>
        this.repository.transaction(async (transaction) => {
          const payable = await this.lockPayable(payableId, transaction);
          const live = await this.findLiveSettlement(payable.id, transaction);

          if (live) {
            if (sameSettlement(live, input)) {
              return this.settlementResult(payable, live, transaction, true);
            }
            throw new ConflictException({
              code: 'SETTLEMENT_ALREADY_REGISTERED',
              message: `La CxP ya tiene la liquidación ${live.settlementReference} (${live.status}).`,
            });
          }
          if (payable.status === PayableStatus.CANCELLED) {
            throw new ConflictException({
              code: 'PAYABLE_CANCELLED',
              message: 'No se puede pagar una CxP cancelada.',
            });
          }
          if (payable.status === PayableStatus.PAID) {
            throw new ConflictException({
              code: 'PAYABLE_ALREADY_PAID',
              message: 'La CxP ya fue pagada.',
            });
          }

          const reused = await this.settlements.findOne({
            where: {
              settlementReference: input.settlementReference,
              status: { [Op.ne]: SettlementStatus.REJECTED },
            },
            transaction,
          });
          if (reused) {
            throw new ConflictException({
              code: 'DUPLICATE_REFERENCE',
              message: 'La referencia de liquidación ya liquidó otra CxP.',
            });
          }

          await this.assertSettlementMatchesPayable(payable, input, now, transaction);

          const settlement = await this.settlements.create(
            {
              merchantPayableId: payable.id,
              settlementReference: input.settlementReference,
              amount: input.amount,
              currency: input.currency,
              beneficiaryAccountId: input.beneficiaryAccountId,
              paidAt: input.paidAt,
              evidenceFileId: input.evidenceFileId,
              status: SettlementStatus.PENDING_APPROVAL,
              registeredByUserId: actor.userId,
            },
            { transaction },
          );
          return this.settlementResult(payable, settlement, transaction, false);
        }),
    );
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
      const payable = await this.lockPayable(payableId, transaction);
      const settlement = await this.findLiveSettlement(payable.id, transaction);
      if (!settlement) {
        throw new ConflictException({
          code: 'NO_SETTLEMENT',
          message: 'La CxP no tiene una liquidación registrada que confirmar.',
        });
      }
      if (settlement.status === SettlementStatus.CONFIRMED) {
        return this.settlementResult(payable, settlement, transaction, true);
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
          },
        },
        transaction,
      );

      return this.settlementResult(payable, settlement, transaction, false, recovery);
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
      const payable = await this.lockPayable(payableId, transaction);
      const settlement = await this.findLiveSettlement(payable.id, transaction);
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
      return this.settlementResult(payable, settlement, transaction, false);
    });
  }

  // ------------------------------------------------------------------------------------------
  // 3. Recuperación contra el consumidor
  // ------------------------------------------------------------------------------------------

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
          const same =
            existing.recoveryId === recovery.id &&
            existing.movementType === RecoveryMovementType.PAYMENT &&
            toMinorUnits(existing.amount) === toMinorUnits(input.amount) &&
            existing.currency === input.currency;
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

  // ------------------------------------------------------------------------------------------
  // Apoyo
  // ------------------------------------------------------------------------------------------

  private started(useCase: string): void {
    this.logger.infoContext(B2BCoverageService.name, 'B2B CRM use case started', { useCase });
  }

  private async lockPayable(
    payableId: string,
    transaction: Transaction,
  ): Promise<MerchantPayableModel> {
    const payable = await this.repository.payables.findByPk(payableId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!payable) throw new NotFoundException('CxP ATLAS→comercio no encontrada.');
    return payable;
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

  private findLiveSettlement(
    payableId: string,
    transaction: Transaction,
  ): Promise<MerchantPayableSettlementModel | null> {
    return this.settlements.findOne({
      where: { merchantPayableId: payableId, status: { [Op.ne]: SettlementStatus.REJECTED } },
      transaction,
    });
  }

  private async assertSettlementMatchesPayable(
    payable: MerchantPayableModel,
    input: MarkPayablePaidDto,
    now: Date,
    transaction: Transaction,
  ): Promise<void> {
    const problems: string[] = [];
    if (toMinorUnits(input.amount) !== toMinorUnits(payable.amount)) {
      problems.push(
        `importe ${input.amount} ≠ CxP ${fromMinorUnits(toMinorUnits(payable.amount))}`,
      );
    }
    if (input.currency !== payable.currency) {
      problems.push(`moneda ${input.currency} ≠ CxP ${payable.currency}`);
    }
    if (input.beneficiaryAccountId !== payable.accountId) {
      problems.push('el beneficiario no es el comercio de la CxP');
    }
    if (input.paidAt.getTime() > now.getTime() + CLOCK_SKEW_MS) {
      problems.push('la fecha de pago está en el futuro');
    }
    const evidence = await findEvidenceFileStatus(
      this.repository.sequelize,
      input.evidenceFileId,
      transaction,
    );
    if (evidence !== 'ACTIVE') {
      problems.push('el archivo de evidencia no existe o no está activo');
    }
    if (problems.length > 0) {
      throw new UnprocessableEntityException({
        code: 'SETTLEMENT_MISMATCH',
        message: `La liquidación no corresponde a la CxP: ${problems.join('; ')}.`,
      });
    }
  }

  private async settlementResult(
    payable: MerchantPayableModel,
    settlement: MerchantPayableSettlementModel,
    transaction: Transaction,
    replayed: boolean,
    createdRecovery?: ConsumerRecoveryReceivableModel,
  ): Promise<Record<string, unknown>> {
    const recovery =
      createdRecovery ??
      (settlement.status === SettlementStatus.CONFIRMED
        ? await this.repository.recoveries.findOne({
            where: { merchantPayableId: payable.id },
            transaction,
          })
        : null);
    return {
      outcome: settlement.status,
      replayed,
      payable: toCoveragePayableResponse(payable),
      settlement: toSettlementResponse(settlement),
      recovery: recovery ? toRecoveryResponse(recovery) : null,
    };
  }

  private async openReviewItem(
    installmentId: string,
    reason: CoverageReviewReason,
    details: Record<string, unknown>,
    userId: string | null,
    transaction: Transaction,
  ): Promise<CoverageReviewItemModel> {
    const open = await this.reviewItems.findOne({
      where: { installmentId, reason, status: 'OPEN' },
      transaction,
    });
    if (open) return open;
    return this.reviewItems.create(
      { installmentId, reason, details, openedByUserId: userId, status: 'OPEN' },
      { transaction },
    );
  }

  private async updateRecoveredAmount(
    recovery: ConsumerRecoveryReceivableModel,
    nextMinor: bigint,
    coveredMinor: bigint,
    transaction: Transaction,
  ): Promise<void> {
    const status =
      nextMinor === 0n
        ? RecoveryStatus.OPEN
        : nextMinor === coveredMinor
          ? RecoveryStatus.RECOVERED
          : RecoveryStatus.PARTIALLY_RECOVERED;
    await recovery.update(
      { amountRecovered: fromMinorUnits(nextMinor), recoveryStatus: status },
      { transaction },
    );
  }

  private writeMovementEvent(
    topic: string,
    recovery: ConsumerRecoveryReceivableModel,
    movement: ConsumerRecoveryMovementModel,
    transaction: Transaction,
  ): Promise<void> {
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
        },
      },
      transaction,
    );
  }
}

function sameSettlement(row: MerchantPayableSettlementModel, input: MarkPayablePaidDto): boolean {
  return (
    row.settlementReference === input.settlementReference &&
    toMinorUnits(row.amount) === toMinorUnits(input.amount) &&
    row.currency === input.currency &&
    row.beneficiaryAccountId === input.beneficiaryAccountId &&
    new Date(row.paidAt).getTime() === input.paidAt.getTime() &&
    row.evidenceFileId === input.evidenceFileId
  );
}

function toCoveragePayableResponse(payable: MerchantPayableModel): Record<string, unknown> {
  return {
    ...toPayableResponse(payable),
    currency: payable.currency,
    requestedByUserId: payable.requestedByUserId,
    contractVersionId: payable.contractVersionId,
    businessDate: payable.businessDate,
    eligibilityEvidence: payable.eligibilityEvidence,
    cancelledAt: payable.cancelledAt,
    cancellationReason: payable.cancellationReason,
  };
}

function toSettlementResponse(row: MerchantPayableSettlementModel): Record<string, unknown> {
  return {
    id: row.id,
    merchantPayableId: row.merchantPayableId,
    settlementReference: row.settlementReference,
    amount: row.amount,
    currency: row.currency,
    beneficiaryAccountId: row.beneficiaryAccountId,
    paidAt: row.paidAt,
    evidenceFileId: row.evidenceFileId,
    status: row.status,
    registeredByUserId: row.registeredByUserId,
    decidedByUserId: row.decidedByUserId,
    decidedAt: row.decidedAt,
  };
}

function toRecoveryResponse(recovery: ConsumerRecoveryReceivableModel): Record<string, unknown> {
  return {
    id: recovery.id,
    consumerId: recovery.consumerId,
    merchantPayableId: recovery.merchantPayableId,
    amountCoveredByAtlas: recovery.amountCoveredByAtlas,
    amountRecovered: recovery.amountRecovered,
    currency: recovery.currency,
    recoveryStatus: recovery.recoveryStatus,
  };
}

function toMovementResponse(row: ConsumerRecoveryMovementModel): Record<string, unknown> {
  return {
    id: row.id,
    recoveryId: row.recoveryId,
    movementType: row.movementType,
    paymentReference: row.paymentReference,
    amount: row.amount,
    currency: row.currency,
    reversesMovementId: row.reversesMovementId,
    receivedAt: row.receivedAt,
    reason: row.reason,
  };
}

function toRecoveryResult(
  recovery: ConsumerRecoveryReceivableModel,
  movement: ConsumerRecoveryMovementModel,
  replayed: boolean,
): Record<string, unknown> {
  return {
    id: recovery.id,
    amountCoveredByAtlas: recovery.amountCoveredByAtlas,
    amountRecovered: recovery.amountRecovered,
    recoveryStatus: recovery.recoveryStatus,
    replayed,
    movement: toMovementResponse(movement),
  };
}
