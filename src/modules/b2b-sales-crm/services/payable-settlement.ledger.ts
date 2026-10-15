import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import type { Transaction } from 'sequelize';
import {
  toCoveragePayableResponse,
  toRecoveryResponse,
  toSettlementResponse,
} from '../coverage.mapper';
import type { CoverageActor } from '../domain/coverage-actor';
import type {
  ConsumerRecoveryReceivableModel,
  MerchantPayableModel,
} from '../models/b2b-sales-crm.models';
import { MerchantPayableSettlementModel, SettlementStatus } from '../models/coverage.models';
import { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';
import { BusinessActionLogsService } from '../../business-action-logs/business-action-logs.service';

/**
 * Lo que comparten quienes tocan la CxP ATLAS→comercio y su liquidación: bloquear la CxP, hallar
 * la liquidación viva, dejarla en el registro de actividad y armar la respuesta.
 */
@Injectable()
export class PayableSettlementLedger {
  constructor(
    private readonly repository: B2BSalesCrmRepository,
    @InjectModel(MerchantPayableSettlementModel)
    private readonly settlements: typeof MerchantPayableSettlementModel,
    private readonly businessActionLogs: BusinessActionLogsService,
  ) {}

  async lockPayable(payableId: string, transaction: Transaction): Promise<MerchantPayableModel> {
    const payable = await this.repository.payables.findByPk(payableId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!payable) throw new NotFoundException('CxP ATLAS→comercio no encontrada.');
    return payable;
  }

  /** La liquidación que sigue en pie (registrada o confirmada): las rechazadas liberan la CxP. */
  findLiveSettlement(
    payableId: string,
    transaction: Transaction,
  ): Promise<MerchantPayableSettlementModel | null> {
    return this.settlements.findOne({
      where: { merchantPayableId: payableId, status: { [Op.ne]: SettlementStatus.REJECTED } },
      transaction,
    });
  }

  /** Liquidación de cobertura en el registro de actividad: quién registró o decidió, y sobre qué. */
  async recordSettlementAction(
    actionCode: string,
    payableId: string,
    settlementId: string,
    actor: CoverageActor,
    inputSummary: Record<string, unknown>,
    transaction: Transaction,
  ): Promise<void> {
    await this.businessActionLogs.record({
      moduleCode: 'CRM',
      businessProcess: 'COVERAGE_SETTLEMENT',
      actionCode,
      actorUserId: actor.userId,
      aggregateType: 'MERCHANT_PAYABLE',
      aggregateId: payableId,
      affectedTables: ['atlas_sales.merchant_payable_settlements'],
      affectedRecordCount: 1,
      status: 'SUCCESS',
      inputSummary,
      outputSummary: { settlementId },
      transaction,
    });
  }

  async settlementResult(
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
}
