/**
 * ¿Puede ATLAS cubrir esta cuota al comercio? Decisión pura, sin base de datos.
 *
 * Reglas financieras del ERP (docs/source-models/docs/05_reglas_negocio.md): el consumidor paga
 * sus cuotas al comercio; si no paga, ATLAS cubre ESA cuota —no acelera la deuda— y la CxC contra
 * el consumidor nace después. Antes de esta función `scheduleCoverage` cubría cualquier cuota, por
 * su importe original, aunque fuera futura, estuviera pagada o cancelada.
 *
 * Tres desenlaces, y ninguno es una aprobación implícita:
 *  - ELIGIBLE: vencida, habilitada, con saldo, contrato activo y sin avisos por resolver. El
 *    importe cubrible es el SALDO (original − pagos CONFIRMADOS), no el importe original.
 *  - REJECTED: no hay nada que cubrir (futura, pagada, cancelada, ya cubierta). No muta nada.
 *  - REVIEW: hay algo que una persona tiene que mirar (aviso de pago sin confirmar, contrato no
 *    activo). Va a la cola de revisión; tampoco crea CxP.
 */
import { isPastDue } from '../../../common/time/business-date';
import { fromMinorUnits, toMinorUnits } from '../../../common/money/decimal-amount.util';
import { InstallmentStatus, PurchaseStatus } from '../b2b-sales-crm.enums';
import { CoverageReviewReason } from '../models/coverage.models';

/** Versión de esta política; queda grabada en la evidencia de cada CxP. */
export const COVERAGE_ELIGIBILITY_POLICY = 'coverage-eligibility/v1';

/** Estados de aviso de pago del consumidor al comercio. */
export const PaymentNoticeStatus = {
  REPORTED: 'REPORTED',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
} as const;

export interface EligibilityNotice {
  id: string;
  status: string;
  amount: string;
}

export interface EligibilityInput {
  installment: { id: string; status: string; dueDate: string; amount: string };
  purchaseStatus: string;
  contract: { id: string; status: string; versionId: string; versionNumber: number } | null;
  notices: readonly EligibilityNotice[];
  hasLivePayable: boolean;
  businessDate: string;
}

export type EligibilityRejection =
  'ALREADY_COVERED' | 'ALREADY_PAID' | 'CANCELLED' | 'NOT_DUE' | 'STATUS_NOT_ELIGIBLE';

export type EligibilityOutcome =
  | { kind: 'ELIGIBLE'; eligibleAmount: string; evidence: Record<string, unknown> }
  | { kind: 'REJECTED'; code: EligibilityRejection; message: string }
  | {
      kind: 'REVIEW';
      reason: CoverageReviewReason;
      message: string;
      evidence: Record<string, unknown>;
    };

const COVERABLE_STATUSES = new Set<string>([
  InstallmentStatus.SCHEDULED,
  InstallmentStatus.OVERDUE,
]);

function reject(code: EligibilityRejection, message: string): EligibilityOutcome {
  return { kind: 'REJECTED', code, message };
}

export function evaluateCoverageEligibility(input: EligibilityInput): EligibilityOutcome {
  const { installment } = input;

  if (input.hasLivePayable || installment.status === InstallmentStatus.COVERED_BY_ATLAS) {
    return reject('ALREADY_COVERED', 'La cuota ya tiene una cobertura ATLAS→comercio vigente.');
  }
  if (installment.status === InstallmentStatus.PAID_TO_MERCHANT) {
    return reject('ALREADY_PAID', 'La cuota ya figura pagada al comercio.');
  }
  if (installment.status === 'CANCELLED' || input.purchaseStatus === PurchaseStatus.CANCELLED) {
    return reject('CANCELLED', 'La cuota o su compra están canceladas.');
  }
  if (!COVERABLE_STATUSES.has(installment.status)) {
    return reject(
      'STATUS_NOT_ELIGIBLE',
      `La cuota en estado ${installment.status} no es cubrible.`,
    );
  }
  if (input.purchaseStatus !== PurchaseStatus.CONFIRMED) {
    return reject(
      'STATUS_NOT_ELIGIBLE',
      `La compra en estado ${input.purchaseStatus} no es cubrible.`,
    );
  }
  if (!isPastDue(installment.dueDate, input.businessDate)) {
    return reject(
      'NOT_DUE',
      `La cuota vence el ${installment.dueDate}; el día de negocio es ${input.businessDate}.`,
    );
  }

  const originalMinor = toMinorUnits(installment.amount);
  const confirmed = input.notices.filter((n) => n.status === PaymentNoticeStatus.CONFIRMED);
  const pending = input.notices.filter((n) => n.status === PaymentNoticeStatus.REPORTED);
  const rejected = input.notices.filter((n) => n.status === PaymentNoticeStatus.REJECTED);
  const confirmedMinor = confirmed.reduce((sum, n) => sum + toMinorUnits(n.amount), 0n);
  const balanceMinor = originalMinor - confirmedMinor;

  if (balanceMinor <= 0n) {
    return reject('ALREADY_PAID', 'Los pagos confirmados cubren el importe de la cuota.');
  }

  const evidence: Record<string, unknown> = {
    policy: COVERAGE_ELIGIBILITY_POLICY,
    businessDate: input.businessDate,
    dueDate: installment.dueDate,
    installmentStatus: installment.status,
    installmentAmount: fromMinorUnits(originalMinor),
    confirmedPaidAmount: fromMinorUnits(confirmedMinor),
    eligibleAmount: fromMinorUnits(balanceMinor),
    confirmedNoticeIds: confirmed.map((n) => n.id),
    pendingNoticeIds: pending.map((n) => n.id),
    rejectedNoticeIds: rejected.map((n) => n.id),
    contract: input.contract,
  };

  if (pending.length > 0) {
    return {
      kind: 'REVIEW',
      reason: CoverageReviewReason.COVERAGE_WITH_PENDING_NOTICE,
      message: 'La cuota tiene avisos de pago sin confirmar: la cobertura pasa a revisión.',
      evidence,
    };
  }
  if (!input.contract || input.contract.status !== 'ACTIVE') {
    return {
      kind: 'REVIEW',
      reason: CoverageReviewReason.CONTRACT_NOT_ACTIVE,
      message: 'El contrato de la compra no está activo: la cobertura pasa a revisión.',
      evidence,
    };
  }

  return { kind: 'ELIGIBLE', eligibleAmount: fromMinorUnits(balanceMinor), evidence };
}
