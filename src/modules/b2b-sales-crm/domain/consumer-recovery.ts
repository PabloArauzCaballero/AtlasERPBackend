import { toMinorUnits } from '../../../common/money/decimal-amount.util';
import { RecoveryStatus } from '../b2b-sales-crm.enums';

/** Estado de la CxC de recuperación según lo recuperado (en unidades menores) sobre lo cubierto. */
export function recoveryStatusFor(recoveredMinor: bigint, coveredMinor: bigint): RecoveryStatus {
  if (recoveredMinor === 0n) return RecoveryStatus.OPEN;
  return recoveredMinor === coveredMinor
    ? RecoveryStatus.RECOVERED
    : RecoveryStatus.PARTIALLY_RECOVERED;
}

/** Un cobro ya registrado con esta referencia es el MISMO si coincide en cobro, importe y moneda. */
export function isSameRecoveryPayment(
  existing: {
    recoveryId: string;
    movementType: string;
    amount: number | string;
    currency: string;
  },
  expected: { recoveryId: string; paymentType: string; amount: number | string; currency: string },
): boolean {
  return (
    existing.recoveryId === expected.recoveryId &&
    existing.movementType === expected.paymentType &&
    toMinorUnits(existing.amount) === toMinorUnits(expected.amount) &&
    existing.currency === expected.currency
  );
}
