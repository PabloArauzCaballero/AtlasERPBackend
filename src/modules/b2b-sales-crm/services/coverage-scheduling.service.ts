import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import type { Transaction } from 'sequelize';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import { businessDate } from '../../../common/time/business-date';
import { InstallmentStatus, PayableStatus } from '../b2b-sales-crm.enums';
import type { CancelPayableDto, ScheduleCoverageDto } from '../b2b-sales-crm.dtos';
import { toCoveragePayableResponse } from '../coverage.mapper';
import type { CoverageActor } from '../domain/coverage-actor';
import { evaluateCoverageEligibility } from '../domain/coverage-eligibility';
import { CoverageReviewItemModel, CoverageReviewResolution } from '../models/coverage.models';
import type { CoverageReviewReason } from '../models/coverage.models';
import { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';
import { B2BSalesCrmUseCaseBase } from './b2b-sales-crm-use-case.base';
import { mapUniqueViolation } from './coverage-ledger.support';
import { toReviewItemResponse } from './coverage-review.service';
import { PayableSettlementLedger } from './payable-settlement.ledger';

/**
 * Programar la cobertura ATLAS→comercio de una cuota BNPL impaga, o cancelarla mientras no se haya
 * liquidado. Sólo una cuota vencida, impaga y sin cobertura viva, por su SALDO; lo ambiguo (aviso de
 * pago sin confirmar, contrato no activo) va a la cola de revisión.
 */
@Injectable()
export class CoverageSchedulingService extends B2BSalesCrmUseCaseBase {
  constructor(
    repository: B2BSalesCrmRepository,
    logger: PinoLoggerService,
    @InjectModel(CoverageReviewItemModel)
    private readonly reviewItems: typeof CoverageReviewItemModel,
    private readonly ledger: PayableSettlementLedger,
  ) {
    super(repository, logger);
  }

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
      const payable = await this.ledger.lockPayable(payableId, transaction);
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
      const live = await this.ledger.findLiveSettlement(payable.id, transaction);
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
}
