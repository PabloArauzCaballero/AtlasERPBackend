import { BadRequestException } from '@nestjs/common';
import { DoubleEntryValidator } from '../src/modules/accounting/posting/validators/double-entry.validator';

describe('DoubleEntryValidator', () => {
  const validator = new DoubleEntryValidator();

  it('accepts balanced journal lines', () => {
    expect(() =>
      validator.validate([
        { debit: 100, credit: 0 },
        { debit: 0, credit: 100 },
      ]),
    ).not.toThrow();
  });

  it('rejects unbalanced journal lines', () => {
    expect(() =>
      validator.validate([
        { debit: 100, credit: 0 },
        { debit: 0, credit: 99 },
      ]),
    ).toThrow(BadRequestException);
  });

  it('rejects lines with debit and credit at the same time', () => {
    expect(() => validator.validate([{ debit: 100, credit: 100 }])).toThrow(BadRequestException);
  });

  it('balances decimal cents exactly without floating point drift', () => {
    expect(() =>
      validator.validate([
        { debit: 0.1, credit: 0 },
        { debit: 0.2, credit: 0 },
        { debit: 0, credit: 0.3 },
      ]),
    ).not.toThrow();
    expect(() =>
      validator.validate([
        { debit: '9999999999999999.99', credit: 0 },
        { debit: 0, credit: '9999999999999999.99' },
      ]),
    ).not.toThrow();
  });

  it('rejects an imbalance of one cent, including after a large total', () => {
    expect(() =>
      validator.validate([
        { debit: '9999999999999999.99', credit: 0 },
        { debit: 0, credit: '9999999999999999.98' },
      ]),
    ).toThrow(BadRequestException);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.01, 0.001])(
    'rejects an invalid monetary amount (%s)',
    (invalid) => {
      expect(() =>
        validator.validate([
          { debit: invalid, credit: 0 },
          { debit: 0, credit: 1 },
        ]),
      ).toThrow(BadRequestException);
    },
  );
});
