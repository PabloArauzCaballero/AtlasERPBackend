import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import type { Transaction } from 'sequelize';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import { PayableStatus } from '../b2b-sales-crm.enums';
import type { MarkPayablePaidDto } from '../b2b-sales-crm.dtos';
import type { CoverageActor } from '../domain/coverage-actor';
import { isSameSettlement, settlementMismatches } from '../domain/payable-settlement';
import type { MerchantPayableModel } from '../models/b2b-sales-crm.models';
import { MerchantPayableSettlementModel, SettlementStatus } from '../models/coverage.models';
import { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';
import { B2BSalesCrmUseCaseBase } from './b2b-sales-crm-use-case.base';
import { findEvidenceFileStatus, mapUniqueViolation } from './coverage-ledger.support';
import { PayableSettlementLedger } from './payable-settlement.ledger';

/**
 * Registrar la liquidación al comercio: la CxP se da por pagada con una liquidación identificada
 * (referencia única, importe, moneda, beneficiario, fecha, evidencia) que registra una persona y
 * confirma OTRA (`PayableSettlementDecisionService`).
 */
@Injectable()
export class PayableSettlementService extends B2BSalesCrmUseCaseBase {
  constructor(
    repository: B2BSalesCrmRepository,
    logger: PinoLoggerService,
    @InjectModel(MerchantPayableSettlementModel)
    private readonly settlements: typeof MerchantPayableSettlementModel,
    private readonly ledger: PayableSettlementLedger,
  ) {
    super(repository, logger);
  }

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
          const payable = await this.ledger.lockPayable(payableId, transaction);
          const live = await this.ledger.findLiveSettlement(payable.id, transaction);

          if (live) {
            if (isSameSettlement(live, input)) {
              return this.ledger.settlementResult(payable, live, transaction, true);
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
          await this.ledger.recordSettlementAction(
            'REGISTER_PAYABLE_SETTLEMENT',
            payable.id,
            settlement.id,
            actor,
            { settlementReference: input.settlementReference, amount: String(input.amount) },
            transaction,
          );
          return this.ledger.settlementResult(payable, settlement, transaction, false);
        }),
    );
  }

  private async assertSettlementMatchesPayable(
    payable: MerchantPayableModel,
    input: MarkPayablePaidDto,
    now: Date,
    transaction: Transaction,
  ): Promise<void> {
    const evidenceStatus = await findEvidenceFileStatus(
      this.repository.sequelize,
      input.evidenceFileId,
      transaction,
    );
    const problems = settlementMismatches({ payable, declared: input, now, evidenceStatus });
    if (problems.length > 0) {
      throw new UnprocessableEntityException({
        code: 'SETTLEMENT_MISMATCH',
        message: `La liquidación no corresponde a la CxP: ${problems.join('; ')}.`,
      });
    }
  }
}
