/**
 * P-07 · Invariantes del dinero (PLAN.md §5 P-07, aceptación).
 *
 * Ningún céntimo aparece ni desaparece: sumas exactas, reparto de cuotas con residuo determinista,
 * MDR con tasa de 6 decimales y redondeo declarado, importe máximo de `numeric(18,2)`, monedas que
 * no se mezclan y debe = haber. Sin base de datos: son las funciones que usan los servicios y los
 * esquemas del borde, no una copia.
 */
import { BadRequestException } from '@nestjs/common';
import {
  AmountOutOfRangeError,
  CurrencyMismatchError,
  MONEY_ROUNDING_MODE,
  NUMERIC_18_2_MAX_MINOR,
  UnsupportedCurrencyError,
  allocateProportionally,
  applyRatePercent,
  assertSingleCurrency,
  divideRounded,
  fromMinorUnits,
  parseMoney,
  parseRatePercent,
  splitEvenly,
  sumMinor,
} from '../src/common/money/decimal-amount.util';
import {
  allocationsMatchPayment,
  computeInvoiceTotals,
  computeMdrFee,
  purchaseSplitViolations,
} from '../src/modules/b2b-sales-crm/domain/merchant-billing-math';
import {
  registerMerchantPaymentSchema,
  registerPurchaseSchema,
} from '../src/modules/b2b-sales-crm/b2b-sales-crm.schemas';
import { DoubleEntryValidator } from '../src/modules/accounting/posting/validators/double-entry.validator';
import { B2BReconciliationService } from '../src/modules/b2b-sales-crm/services/b2b-reconciliation.service';
import type { B2BSalesCrmRepository } from '../src/modules/b2b-sales-crm/repositories/b2b-sales-crm.repository';
import { PinoLoggerService } from '../src/common/logging/pino-logger.service';

const money = (minor: bigint) => fromMinorUnits(minor);

describe('P-07 invariantes del dinero', () => {
  it('0,10 + 0,20 = 0,30 exacto', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(money(parseMoney('0.10') + parseMoney('0.20'))).toBe('0.30');
    expect(money(parseMoney(0.1) + parseMoney(0.2))).toBe('0.30');
    expect(money(parseMoney(0.1 + 0.2))).toBe('0.30');
  });

  it('1.000 pagos de 0,01 suman exactamente 10,00', () => {
    const payments = Array.from({ length: 1000 }, () => parseMoney('0.01'));
    expect(money(sumMinor(payments))).toBe('10.00');
    expect(
      allocationsMatchPayment(
        '10.00',
        payments.map(() => ({ amountApplied: 0.01 })),
      ),
    ).toBe(true);
  });

  it('100,00 en tres cuotas: 33,34 + 33,33 + 33,33 con el residuo en la primera', () => {
    const parts = splitEvenly(parseMoney('100.00'), 3);
    expect(parts.map(money)).toEqual(['33.34', '33.33', '33.33']);
    expect(money(sumMinor(parts))).toBe('100.00');
  });

  it('jornada: 1.000,00 financiados en 400,00 + 300,00 + 300,00 suman exacto', () => {
    const parts = allocateProportionally(parseMoney('1000.00'), [4n, 3n, 3n]);
    expect(parts.map(money)).toEqual(['400.00', '300.00', '300.00']);
    expect(
      purchaseSplitViolations({
        purchaseAmount: '2500.00',
        downPaymentAmount: '1500.00',
        financedAmount: '1000.00',
        installments: parts.map((amount, index) => ({
          installmentNumber: index + 1,
          amount: money(amount),
        })),
      }),
    ).toEqual([]);
  });

  it('el reparto es determinista y exacto para cualquier total y número de partes', () => {
    for (const total of [1n, 2n, 99n, 100n, 101n, 99_999n, NUMERIC_18_2_MAX_MINOR]) {
      for (const count of [1, 2, 3, 7, 12]) {
        const parts = splitEvenly(total, count);
        expect(sumMinor(parts)).toBe(total);
        expect(splitEvenly(total, count)).toEqual(parts);
        const max = parts.reduce((a, b) => (a > b ? a : b));
        const min = parts.reduce((a, b) => (a < b ? a : b));
        expect(max - min).toBeLessThan(BigInt(count));
      }
    }
  });

  it('cuotas que no suman el financiado por un céntimo se rechazan en el borde', () => {
    const result = registerPurchaseSchema.safeParse({
      branchId: '00000000-0000-4000-8000-000000000001',
      consumerExternalRef: 'CI-1',
      purchaseAmount: 1000,
      downPaymentAmount: 600,
      financedAmount: 400,
      mdrReceivableDueDate: '2026-10-01',
      installments: [
        { installmentNumber: 1, dueDate: '2026-10-01', amount: 200 },
        { installmentNumber: 2, dueDate: '2026-11-01', amount: 199.99 },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain('installments');
  });

  it('asignaciones de pago que no suman el pago por un céntimo se rechazan en el borde', () => {
    const result = registerMerchantPaymentSchema.safeParse({
      accountId: '00000000-0000-4000-8000-000000000001',
      amount: 0.03,
      paidAt: '2026-09-24',
      allocations: [
        { receivableId: '00000000-0000-4000-8000-000000000002', amountApplied: 0.01 },
        { receivableId: '00000000-0000-4000-8000-000000000003', amountApplied: 0.01 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('importe máximo de numeric(18,2) sin pérdida, y uno más se rechaza', () => {
    const max = parseMoney('9999999999999999.99');
    expect(max).toBe(NUMERIC_18_2_MAX_MINOR);
    expect(money(max)).toBe('9999999999999999.99');
    expect(() => parseMoney('10000000000000000.00')).toThrow(AmountOutOfRangeError);
    // Un `number` ya no distingue céntimos a esa magnitud: se exige texto, no se redondea.
    expect(() => parseMoney(9999999999999999.99)).toThrow(AmountOutOfRangeError);
    expect(() =>
      new DoubleEntryValidator().validate([
        { debit: '9999999999999999.99', credit: 0 },
        { debit: 0, credit: '9999999999999999.99' },
      ]),
    ).not.toThrow();
  });

  it('rechaza céntimos fraccionarios, negativos y monedas desconocidas en vez de redondear', () => {
    expect(() => parseMoney('10.005')).toThrow(AmountOutOfRangeError);
    expect(() => parseMoney('-1.00')).toThrow(AmountOutOfRangeError);
    expect(() => parseMoney('1.00', { currency: 'XYZ' })).toThrow(UnsupportedCurrencyError);
    expect(parseMoney('10.50000')).toBe(1050n);
  });

  it('tasa de 6 decimales: 1.000,00 × 1,234567 % = 12,35 y más decimales se rechazan', () => {
    const rate = parseRatePercent('1.234567');
    expect(rate).toBe(1_234_567n);
    expect(money(applyRatePercent(parseMoney('1000.00'), rate))).toBe('12.35');
    expect(computeMdrFee('1000.00', { ratePercent: '1.234567' })).toMatchObject({
      ratePercent: '1.234567',
      fee: '12.35',
    });
    expect(() => parseRatePercent('1.2345678')).toThrow(AmountOutOfRangeError);
    expect(() => parseRatePercent('100.000001')).toThrow(AmountOutOfRangeError);
  });

  it('redondeo declarado HALF_UP: medio céntimo exacto sube, alejándose de cero', () => {
    expect(MONEY_ROUNDING_MODE).toBe('HALF_UP');
    // 0,50 × 1 % = 0,005 → 0,01
    expect(money(applyRatePercent(parseMoney('0.50'), parseRatePercent('1')))).toBe('0.01');
    expect(divideRounded(-5n, 10n)).toBe(-1n);
    expect(divideRounded(5n, 10n, 'HALF_EVEN')).toBe(0n);
    expect(divideRounded(15n, 10n, 'HALF_EVEN')).toBe(2n);
  });

  it('MDR acotado por el mínimo y el máximo de la regla', () => {
    expect(computeMdrFee('100.00', { ratePercent: '2', minFeeAmount: '5.00' }).fee).toBe('5.00');
    expect(computeMdrFee('100000.00', { ratePercent: '2', maxFeeAmount: '500.00' }).fee).toBe(
      '500.00',
    );
  });

  it('una factura con cargos en monedas distintas se rechaza; en una moneda cuadra al céntimo', () => {
    expect(() => assertSingleCurrency(['BOB', 'USD'])).toThrow(CurrencyMismatchError);
    expect(() =>
      computeInvoiceTotals(
        [
          { id: 'a', amountOpen: '10.00', currency: 'BOB' },
          { id: 'b', amountOpen: '10.00', currency: 'USD' },
        ],
        13,
      ),
    ).toThrow(expect.objectContaining({ code: 'MIXED_CURRENCIES' }));

    const totals = computeInvoiceTotals(
      [
        { id: 'a', amountOpen: '0.10', currency: 'BOB' },
        { id: 'b', amountOpen: '0.10', currency: 'BOB' },
        { id: 'c', amountOpen: '0.10', currency: 'BOB' },
      ],
      13,
    );
    expect(totals).toMatchObject({ currency: 'BOB', subtotal: '0.30', tax: '0.04', total: '0.34' });
    const lineTax = sumMinor(totals.lines.map((line) => parseMoney(line.tax)));
    const lineTotal = sumMinor(totals.lines.map((line) => parseMoney(line.total)));
    expect(money(lineTax)).toBe(totals.tax);
    expect(money(lineTotal)).toBe(totals.total);
  });

  it('debe = haber al céntimo; un céntimo de diferencia es un asiento descuadrado', () => {
    const validator = new DoubleEntryValidator();
    expect(() =>
      validator.validate([
        { debit: '113.00', credit: 0 },
        { debit: 0, credit: '100.00' },
        { debit: 0, credit: '13.00' },
      ]),
    ).not.toThrow();
    expect(() =>
      validator.validate([
        { debit: '113.00', credit: 0 },
        { debit: 0, credit: '100.00' },
        { debit: 0, credit: '12.99' },
      ]),
    ).toThrow(BadRequestException);
  });

  it('saldo inicial + movimientos = saldo final con 1.000 movimientos de céntimos', () => {
    const opening = parseMoney('1000.00');
    const movements = Array.from({ length: 1000 }, (_, index) =>
      index % 2 === 0 ? parseMoney('0.07') : -parseMoney('0.03'),
    );
    expect(money(opening + sumMinor(movements))).toBe('1020.00');
  });

  it('resumen de comisiones del comercio: cobrado − abierto = liquidado, al céntimo', async () => {
    const rows = Array.from({ length: 200 }, (_, index) => ({
      id: String(index),
      sourceId: null,
      amountOriginal: '0.10',
      amountOpen: index % 3 === 0 ? '0.10' : '0.00',
      currency: 'BOB',
    }));
    const repository = {
      receivables: { findAll: () => Promise.resolve(rows) },
    } as unknown as B2BSalesCrmRepository;
    const service = new B2BReconciliationService(repository, new PinoLoggerService());
    const result = (await service.listCommissions('cuenta')) as {
      summary: { chargedTotal: string; owedToAtlas: string; settled: string };
    };
    expect(result.summary).toMatchObject({
      chargedTotal: '20.00',
      owedToAtlas: '6.70',
      settled: '13.30',
    });
  });
});
