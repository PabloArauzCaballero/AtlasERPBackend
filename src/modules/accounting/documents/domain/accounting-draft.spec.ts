import { localCurrencyAmountOf } from './accounting-draft';
import { sealJournal } from './journal-seal';

describe('localCurrencyAmountOf', () => {
  const line = { glAccountId: 'gl', currencyCode: 'BOB' };

  it('usa el importe en moneda local informado', () => {
    expect(
      localCurrencyAmountOf({ ...line, debit: 10, credit: 0, amountLc: '12.50' } as never),
    ).toBe('12.50');
  });

  it('sin importe local toma el mayor de debe y haber', () => {
    expect(localCurrencyAmountOf({ ...line, debit: '0', credit: '7.25' } as never)).toBe('7.25');
    expect(localCurrencyAmountOf({ ...line, debit: '9.10', credit: '0' } as never)).toBe('9.10');
  });

  it('un importe local en cero se trata como no informado', () => {
    expect(localCurrencyAmountOf({ ...line, debit: 3, credit: 0, amountLc: '0' } as never)).toBe(
      '3.00',
    );
  });
});

describe('sealJournal', () => {
  const first = { lineNo: 1, glAccountId: 'a', debit: '5.00', credit: '0.00' };
  const lines = [first];

  it('es determinista y sensible a cada línea', () => {
    const base = { documentId: 'd', journalId: 'j', lines };
    expect(sealJournal(base)).toMatch(/^[0-9a-f]{64}$/);
    expect(sealJournal(base)).toBe(sealJournal({ ...base }));
    expect(sealJournal({ ...base, lines: [{ ...first, debit: '6.00' }] })).not.toBe(
      sealJournal(base),
    );
  });
});
