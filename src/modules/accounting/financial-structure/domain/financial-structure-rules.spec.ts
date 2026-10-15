import {
  assertDateRangeIsValid,
  assertGlAccountBalanceConvention,
  assertPeriodInsideFiscalYear,
  legalEntityScope,
  nextPeriodNumber,
} from './financial-structure-rules';

const codeOf = (code: string) =>
  expect.objectContaining({ response: expect.objectContaining({ code }) });

describe('reglas de la estructura financiera', () => {
  it('rechaza un rango de fechas invertido', () => {
    expect(() =>
      assertDateRangeIsValid(new Date('2026-02-01'), new Date('2026-01-01'), 'X'),
    ).toThrow(codeOf('X'));
    expect(() =>
      assertDateRangeIsValid(new Date('2026-01-01'), new Date('2026-01-01'), 'X'),
    ).not.toThrow();
  });

  it('el período debe caer dentro del año fiscal', () => {
    const year = { startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') };
    expect(() =>
      assertPeriodInsideFiscalYear(
        { startDate: new Date('2026-01-01'), endDate: new Date('2026-01-31') },
        year,
      ),
    ).not.toThrow();
    expect(() =>
      assertPeriodInsideFiscalYear(
        { startDate: new Date('2025-12-15'), endDate: new Date('2026-01-31') },
        year,
      ),
    ).toThrow(codeOf('PERIOD_OUTSIDE_FISCAL_YEAR'));
  });

  it('numera el siguiente período y se agota en 13', () => {
    expect(nextPeriodNumber(null)).toBe(1);
    expect(nextPeriodNumber(12)).toBe(13);
    expect(() => nextPeriodNumber(13)).toThrow(codeOf('FISCAL_YEAR_PERIODS_EXHAUSTED'));
  });

  it('exige la naturaleza del saldo según el tipo de cuenta', () => {
    expect(() =>
      assertGlAccountBalanceConvention({ accountType: 'ASSET', normalBalance: 'D' } as never),
    ).not.toThrow();
    expect(() =>
      assertGlAccountBalanceConvention({ accountType: 'ASSET', normalBalance: 'C' } as never),
    ).toThrow(codeOf('INVALID_GL_NORMAL_BALANCE'));
    expect(() =>
      assertGlAccountBalanceConvention({ accountType: 'REVENUE', normalBalance: 'D' } as never),
    ).toThrow(codeOf('INVALID_GL_NORMAL_BALANCE'));
  });

  it('el alcance por entidad es vacío para ADMIN y un IN para el resto', () => {
    expect(legalEntityScope(null)).toEqual({});
    expect(Object.keys(legalEntityScope(['a'], 'id'))).toEqual(['id']);
  });
});
