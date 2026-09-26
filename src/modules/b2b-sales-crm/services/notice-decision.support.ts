/**
 * La transición de un aviso de pago REPORTED a CONFIRMED o REJECTED y lo que arrastra en la cuota.
 *
 * Es UNA sola transición con dos puertas de entrada (P-14): la cola de revisión de cobertura, donde
 * decide una persona de finanzas, y el evento `payment.confirmed/rejected` de Core, donde decidió el
 * comercio autorizado. Las dos llaman aquí para que no puedan divergir: confirmar descuenta del saldo
 * y, si los pagos confirmados cubren la cuota, la deja PAID_TO_MERCHANT; rechazar deja la cuota
 * vencida otra vez cubrible (OVERDUE si el aviso era lo único que lo impedía).
 *
 * Quien llama tiene la cuota bloqueada (`FOR UPDATE`) y comprueba ANTES que no haya cobertura viva
 * (`hasLiveCoverage`): confirmar sobre una cuota cubierta sería doble beneficio.
 */
import { Op } from 'sequelize';
import type { Transaction } from 'sequelize';
import { toMinorUnits } from '../../../common/money/decimal-amount.util';
import { businessDate, isPastDue } from '../../../common/time/business-date';
import { InstallmentStatus, PayableStatus } from '../b2b-sales-crm.enums';
import { PaymentNoticeStatus } from '../domain/coverage-eligibility';
import type {
  BNPLInstallmentModel,
  ConsumerPaymentToMerchantModel,
} from '../models/b2b-sales-crm.models';
import type { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';

/** ¿La cuota tiene una CxP de cobertura no cancelada o ya está cubierta por ATLAS? */
export async function hasLiveCoverage(
  repository: B2BSalesCrmRepository,
  installment: BNPLInstallmentModel,
  transaction: Transaction,
): Promise<boolean> {
  if (installment.status === InstallmentStatus.COVERED_BY_ATLAS) return true;
  const livePayable = await repository.payables.findOne({
    where: { installmentId: installment.id, status: { [Op.ne]: PayableStatus.CANCELLED } },
    transaction,
  });
  return Boolean(livePayable);
}

/** Suma, en unidades menores, de los avisos CONFIRMED de la cuota. */
export async function confirmedMinorOf(
  repository: B2BSalesCrmRepository,
  installmentId: string,
  transaction: Transaction,
): Promise<bigint> {
  const confirmed = await repository.consumerPaymentsToMerchant.findAll({
    attributes: ['amount'],
    where: { installmentId, status: PaymentNoticeStatus.CONFIRMED },
    transaction,
  });
  return confirmed.reduce((sum, row) => sum + toMinorUnits(row.amount), 0n);
}

export interface NoticeDecisionInput {
  installment: BNPLInstallmentModel;
  notice: ConsumerPaymentToMerchantModel;
  /** Avisos REPORTED de la cuota ANTES de decidir, incluido éste. */
  pendingCount: number;
  confirming: boolean;
  /** Persona que decidió en el ERP; `null` cuando decidió el comercio en Core. */
  decidedByUserId: string | null;
  note: string;
  now: Date;
  transaction: Transaction;
}

export async function applyNoticeDecision(
  repository: B2BSalesCrmRepository,
  input: NoticeDecisionInput,
): Promise<{ confirmedMinor: bigint; stillPending: number }> {
  const { installment, notice, confirming, now, transaction } = input;
  await notice.update(
    {
      status: confirming ? PaymentNoticeStatus.CONFIRMED : PaymentNoticeStatus.REJECTED,
      decidedByUserId: input.decidedByUserId,
      decidedAt: now,
      decisionNote: input.note,
    },
    { transaction },
  );

  const confirmedMinor = await confirmedMinorOf(repository, installment.id, transaction);
  const stillPending = input.pendingCount - 1;
  if (confirming && confirmedMinor >= toMinorUnits(installment.amount)) {
    await installment.update(
      { status: InstallmentStatus.PAID_TO_MERCHANT, paidToMerchantAt: notice.paidAt },
      { transaction },
    );
  } else if (
    !confirming &&
    stillPending === 0 &&
    installment.status === InstallmentStatus.SCHEDULED &&
    isPastDue(installment.dueDate, businessDate(now))
  ) {
    // El aviso era lo único que frenaba la mora: sin él, la cuota vencida está en mora.
    await installment.update({ status: InstallmentStatus.OVERDUE }, { transaction });
  }
  return { confirmedMinor, stillPending };
}
