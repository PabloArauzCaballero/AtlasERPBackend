import { fromMinorUnits, toMinorUnits } from '../../../common/money/decimal-amount.util';

/** Tolerancia de reloj para una fecha de pago declarada «ahora». */
export const CLOCK_SKEW_MS = 5 * 60 * 1000;

/** Lo que quien liquida declara haber pagado al comercio. */
export interface DeclaredSettlement {
  settlementReference: string;
  amount: number | string;
  currency: string;
  beneficiaryAccountId: string;
  paidAt: Date;
  evidenceFileId: string;
}

export interface RegisteredSettlement {
  settlementReference: string;
  amount: number | string;
  currency: string;
  beneficiaryAccountId: string;
  paidAt: Date | string;
  evidenceFileId: string;
}

/** Repetir el MISMO registro es idempotente; uno distinto sobre la misma CxP es un conflicto. */
export function isSameSettlement(row: RegisteredSettlement, input: DeclaredSettlement): boolean {
  return (
    row.settlementReference === input.settlementReference &&
    toMinorUnits(row.amount) === toMinorUnits(input.amount) &&
    row.currency === input.currency &&
    row.beneficiaryAccountId === input.beneficiaryAccountId &&
    new Date(row.paidAt).getTime() === input.paidAt.getTime() &&
    row.evidenceFileId === input.evidenceFileId
  );
}

/**
 * Por qué la liquidación declarada NO corresponde a la CxP (importe, moneda, beneficiario, fecha
 * futura, evidencia). Vacío si corresponde. `evidenceStatus` es el estado del archivo de evidencia
 * en el almacén, o `null` si no existe.
 */
export function settlementMismatches(args: {
  payable: { amount: number | string; currency: string; accountId: string };
  declared: DeclaredSettlement;
  now: Date;
  evidenceStatus: string | null;
}): string[] {
  const { payable, declared, now, evidenceStatus } = args;
  const problems: string[] = [];
  if (toMinorUnits(declared.amount) !== toMinorUnits(payable.amount)) {
    problems.push(
      `importe ${declared.amount} ≠ CxP ${fromMinorUnits(toMinorUnits(payable.amount))}`,
    );
  }
  if (declared.currency !== payable.currency) {
    problems.push(`moneda ${declared.currency} ≠ CxP ${payable.currency}`);
  }
  if (declared.beneficiaryAccountId !== payable.accountId) {
    problems.push('el beneficiario no es el comercio de la CxP');
  }
  if (declared.paidAt.getTime() > now.getTime() + CLOCK_SKEW_MS) {
    problems.push('la fecha de pago está en el futuro');
  }
  if (evidenceStatus !== 'ACTIVE') {
    problems.push('el archivo de evidencia no existe o no está activo');
  }
  return problems;
}
