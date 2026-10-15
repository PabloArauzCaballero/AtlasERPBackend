import { RecoveryStatus } from '../b2b-sales-crm.enums';
import { isSameRecoveryPayment, recoveryStatusFor } from './consumer-recovery';
import {
  CLOCK_SKEW_MS,
  isSameSettlement,
  settlementMismatches,
  type DeclaredSettlement,
} from './payable-settlement';

const paidAt = new Date('2026-10-01T10:00:00Z');
const declared: DeclaredSettlement = {
  settlementReference: 'REF-1',
  amount: 100,
  currency: 'BOB',
  beneficiaryAccountId: 'merchant-1',
  paidAt,
  evidenceFileId: 'file-1',
};
const payable = { amount: '100.00', currency: 'BOB', accountId: 'merchant-1' };

describe('isSameSettlement', () => {
  it('reconoce el mismo registro aunque el importe llegue como cadena', () => {
    expect(
      isSameSettlement({ ...declared, amount: '100.00', paidAt: paidAt.toISOString() }, declared),
    ).toBe(true);
  });

  it('distingue cualquier campo distinto', () => {
    expect(isSameSettlement({ ...declared, evidenceFileId: 'otro' }, declared)).toBe(false);
    expect(isSameSettlement({ ...declared, amount: '100.01' }, declared)).toBe(false);
  });
});

describe('settlementMismatches', () => {
  const now = new Date('2026-10-02T00:00:00Z');

  it('no reporta nada cuando la liquidación corresponde a la CxP', () => {
    expect(settlementMismatches({ payable, declared, now, evidenceStatus: 'ACTIVE' })).toEqual([]);
  });

  it('reporta importe, moneda, beneficiario, fecha futura y evidencia', () => {
    const problems = settlementMismatches({
      payable,
      declared: {
        ...declared,
        amount: 99,
        currency: 'USD',
        beneficiaryAccountId: 'otro',
        paidAt: new Date(now.getTime() + CLOCK_SKEW_MS + 1),
      },
      now,
      evidenceStatus: null,
    });
    expect(problems).toHaveLength(5);
  });

  it('tolera el desfase de reloj', () => {
    const edge = { ...declared, paidAt: new Date(now.getTime() + CLOCK_SKEW_MS) };
    expect(
      settlementMismatches({ payable, declared: edge, now, evidenceStatus: 'ACTIVE' }),
    ).toEqual([]);
  });
});

describe('recoveryStatusFor', () => {
  it('abierta, parcial o recuperada según lo recuperado', () => {
    expect(recoveryStatusFor(0n, 1000n)).toBe(RecoveryStatus.OPEN);
    expect(recoveryStatusFor(400n, 1000n)).toBe(RecoveryStatus.PARTIALLY_RECOVERED);
    expect(recoveryStatusFor(1000n, 1000n)).toBe(RecoveryStatus.RECOVERED);
  });
});

describe('isSameRecoveryPayment', () => {
  const existing = { recoveryId: 'r1', movementType: 'PAYMENT', amount: '5.00', currency: 'BOB' };
  const expected = { recoveryId: 'r1', paymentType: 'PAYMENT', amount: 5, currency: 'BOB' };

  it('es el mismo cobro si coinciden CxC, tipo, importe y moneda', () => {
    expect(isSameRecoveryPayment(existing, expected)).toBe(true);
    expect(isSameRecoveryPayment(existing, { ...expected, amount: 6 })).toBe(false);
    expect(isSameRecoveryPayment(existing, { ...expected, recoveryId: 'r2' })).toBe(false);
  });
});
