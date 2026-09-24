/**
 * La política de elegibilidad de cobertura como función pura (sin base): la misma matriz de P-04
 * que la prueba de integración, para que corra también donde no hay PostgreSQL.
 */
import { businessDate, isPastDue } from '../src/common/time/business-date';
import { evaluateCoverageEligibility } from '../src/modules/b2b-sales-crm/domain/coverage-eligibility';
import type { EligibilityInput } from '../src/modules/b2b-sales-crm/domain/coverage-eligibility';

const TODAY = '2026-09-24';

function input(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    installment: { id: 'i1', status: 'SCHEDULED', dueDate: '2026-09-20', amount: '300.00' },
    purchaseStatus: 'CONFIRMED',
    contract: { id: 'c1', status: 'ACTIVE', versionId: 'v1', versionNumber: 1 },
    notices: [],
    hasLivePayable: false,
    businessDate: TODAY,
    ...overrides,
  };
}

describe('política de elegibilidad de cobertura', () => {
  it('cuota futura o que vence hoy: NOT_DUE', () => {
    for (const dueDate of ['2026-10-01', TODAY]) {
      const outcome = evaluateCoverageEligibility(
        input({ installment: { id: 'i1', status: 'SCHEDULED', dueDate, amount: '300.00' } }),
      );
      expect(outcome).toMatchObject({ kind: 'REJECTED', code: 'NOT_DUE' });
    }
  });

  it('vencida sin pago: elegible por el total', () => {
    expect(evaluateCoverageEligibility(input())).toMatchObject({
      kind: 'ELIGIBLE',
      eligibleAmount: '300.00',
    });
  });

  it('parcialmente pagada: elegible por el saldo exacto en centavos', () => {
    const outcome = evaluateCoverageEligibility(
      input({
        notices: [
          { id: 'n1', status: 'CONFIRMED', amount: '0.10' },
          { id: 'n2', status: 'CONFIRMED', amount: '0.20' },
        ],
      }),
    );
    expect(outcome).toMatchObject({ kind: 'ELIGIBLE', eligibleAmount: '299.70' });
  });

  it('aviso REPORTED: revisión, nunca aprobación implícita', () => {
    const outcome = evaluateCoverageEligibility(
      input({ notices: [{ id: 'n1', status: 'REPORTED', amount: '300.00' }] }),
    );
    expect(outcome).toMatchObject({ kind: 'REVIEW', reason: 'COVERAGE_WITH_PENDING_NOTICE' });
  });

  it('aviso REJECTED: no cuenta como pago', () => {
    const outcome = evaluateCoverageEligibility(
      input({ notices: [{ id: 'n1', status: 'REJECTED', amount: '300.00' }] }),
    );
    expect(outcome).toMatchObject({ kind: 'ELIGIBLE', eligibleAmount: '300.00' });
  });

  it('pago confirmado completo, pagada al comercio, cancelada o ya cubierta: rechazo', () => {
    const cases: Array<[Partial<EligibilityInput>, string]> = [
      [{ notices: [{ id: 'n', status: 'CONFIRMED', amount: '300.00' }] }, 'ALREADY_PAID'],
      [
        {
          installment: {
            id: 'i1',
            status: 'PAID_TO_MERCHANT',
            dueDate: '2026-09-20',
            amount: '300.00',
          },
        },
        'ALREADY_PAID',
      ],
      [
        { installment: { id: 'i1', status: 'CANCELLED', dueDate: '2026-09-20', amount: '300.00' } },
        'CANCELLED',
      ],
      [{ purchaseStatus: 'CANCELLED' }, 'CANCELLED'],
      [{ hasLivePayable: true }, 'ALREADY_COVERED'],
    ];
    for (const [overrides, code] of cases) {
      expect(evaluateCoverageEligibility(input(overrides))).toMatchObject({
        kind: 'REJECTED',
        code,
      });
    }
  });

  it('contrato no activo o ausente: revisión', () => {
    expect(
      evaluateCoverageEligibility(
        input({ contract: { id: 'c1', status: 'SUSPENDED', versionId: 'v1', versionNumber: 1 } }),
      ),
    ).toMatchObject({ kind: 'REVIEW', reason: 'CONTRACT_NOT_ACTIVE' });
    expect(evaluateCoverageEligibility(input({ contract: null }))).toMatchObject({
      kind: 'REVIEW',
      reason: 'CONTRACT_NOT_ACTIVE',
    });
  });

  it('el día de negocio es el de La Paz (UTC−4), no el de UTC', () => {
    expect(businessDate(new Date('2026-09-24T03:59:59Z'))).toBe('2026-09-23');
    expect(businessDate(new Date('2026-09-24T04:00:00Z'))).toBe('2026-09-24');
    expect(isPastDue('2026-09-23', businessDate(new Date('2026-09-24T02:00:00Z')))).toBe(false);
  });
});
