import {
  InvalidDecimalAmountError,
  fromMinorUnits,
  isPositiveAmount,
  normalizeAmount,
  sumAmounts,
  sumMinorUnits,
  toMinorUnits,
} from './decimal-amount.util';

describe('decimal-amount.util', () => {
  describe('toMinorUnits', () => {
    it('convierte cadenas numeric de PostgreSQL a centavos', () => {
      expect(toMinorUnits('1234.56')).toBe(123456n);
      expect(toMinorUnits('1234')).toBe(123400n);
      expect(toMinorUnits('1234.5')).toBe(123450n);
      expect(toMinorUnits('0.07')).toBe(7n);
    });

    it('trata nulos y cadenas vacías como cero', () => {
      expect(toMinorUnits(null)).toBe(0n);
      expect(toMinorUnits(undefined)).toBe(0n);
      expect(toMinorUnits('')).toBe(0n);
      expect(toMinorUnits('   ')).toBe(0n);
    });

    it('preserva el signo y redondea media unidad alejándose de cero', () => {
      expect(toMinorUnits('-1234.56')).toBe(-123456n);
      expect(toMinorUnits('1.005')).toBe(101n);
      expect(toMinorUnits('-1.005')).toBe(-101n);
      expect(toMinorUnits('1.004')).toBe(100n);
    });

    it('no pierde precisión con importes mayores al entero seguro de JavaScript', () => {
      expect(toMinorUnits('99999999999999.99')).toBe(9999999999999999n);
    });

    it('rechaza entradas que no son importes decimales', () => {
      expect(() => toMinorUnits('1e3')).toThrow(InvalidDecimalAmountError);
      expect(() => toMinorUnits('1,234.56')).toThrow(InvalidDecimalAmountError);
      expect(() => toMinorUnits('abc')).toThrow(InvalidDecimalAmountError);
      expect(() => toMinorUnits(Number.NaN)).toThrow(InvalidDecimalAmountError);
      expect(() => toMinorUnits(Number.POSITIVE_INFINITY)).toThrow(InvalidDecimalAmountError);
      expect(() => toMinorUnits({})).toThrow(InvalidDecimalAmountError);
    });
  });

  describe('fromMinorUnits', () => {
    it('formatea centavos con dos decimales', () => {
      expect(fromMinorUnits(123456n)).toBe('1234.56');
      expect(fromMinorUnits(7n)).toBe('0.07');
      expect(fromMinorUnits(0n)).toBe('0.00');
      expect(fromMinorUnits(-123456n)).toBe('-1234.56');
    });

    it('admite escala cero', () => {
      expect(fromMinorUnits(1234n, 0)).toBe('1234');
    });
  });

  describe('sumAmounts', () => {
    it('suma sin el error de coma flotante que tenía el panel de facturación', () => {
      // 0.1 + 0.2 en `number` da 0.30000000000000004.
      expect(sumAmounts(['0.10', '0.20'])).toBe('0.30');
    });

    it('acumula exactamente listas largas de importes', () => {
      const rows = Array.from({ length: 1000 }, () => '0.07');
      expect(sumAmounts(rows)).toBe('70.00');
      expect(sumMinorUnits(rows)).toBe(7000n);
    });

    it('mezcla nulos, números y cadenas', () => {
      expect(sumAmounts(['100.55', null, 20.4, undefined, '-0.55'])).toBe('120.40');
    });
  });

  describe('normalizeAmount / isPositiveAmount', () => {
    it('canoniza la representación del importe', () => {
      expect(normalizeAmount('7')).toBe('7.00');
      expect(normalizeAmount(null)).toBe('0.00');
      expect(normalizeAmount('0000.5')).toBe('0.50');
    });

    it('detecta importes estrictamente positivos', () => {
      expect(isPositiveAmount('0.01')).toBe(true);
      expect(isPositiveAmount('0.00')).toBe(false);
      expect(isPositiveAmount('-1.00')).toBe(false);
      expect(isPositiveAmount(null)).toBe(false);
    });
  });
});
