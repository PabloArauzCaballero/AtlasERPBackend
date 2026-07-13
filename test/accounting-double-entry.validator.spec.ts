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
});
