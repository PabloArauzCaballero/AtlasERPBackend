import { toPayableResponse } from './b2b-sales-crm.mapper';
import type {
  ConsumerRecoveryReceivableModel,
  MerchantPayableModel,
} from './models/b2b-sales-crm.models';
import type {
  ConsumerRecoveryMovementModel,
  MerchantPayableSettlementModel,
} from './models/coverage.models';

export function toCoveragePayableResponse(payable: MerchantPayableModel): Record<string, unknown> {
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

export function toSettlementResponse(row: MerchantPayableSettlementModel): Record<string, unknown> {
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

export function toRecoveryResponse(
  recovery: ConsumerRecoveryReceivableModel,
): Record<string, unknown> {
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

export function toMovementResponse(row: ConsumerRecoveryMovementModel): Record<string, unknown> {
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

export function toRecoveryResult(
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
