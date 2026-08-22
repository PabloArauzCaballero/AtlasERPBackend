import { addMonthsUtc, computePeriodEnd, lastDayOfUtcMonth } from './billing-period.util';

const iso = (value: string): Date => new Date(value);

describe('billing-period.util', () => {
  describe('addMonthsUtc', () => {
    it('no desborda al mes siguiente cuando el día no existe en el mes destino', () => {
      // `setMonth` habría devuelto el 3 de marzo (o el 2 en año bisiesto).
      expect(addMonthsUtc(iso('2026-01-31T10:00:00.000Z'), 1).toISOString()).toBe(
        '2026-02-28T10:00:00.000Z',
      );
      expect(addMonthsUtc(iso('2024-01-31T10:00:00.000Z'), 1).toISOString()).toBe(
        '2024-02-29T10:00:00.000Z',
      );
      expect(addMonthsUtc(iso('2026-05-31T00:00:00.000Z'), 1).toISOString()).toBe(
        '2026-06-30T00:00:00.000Z',
      );
    });

    it('mantiene el día cuando el mes destino lo admite', () => {
      expect(addMonthsUtc(iso('2026-03-15T08:30:45.123Z'), 1).toISOString()).toBe(
        '2026-04-15T08:30:45.123Z',
      );
    });

    it('cruza el año hacia adelante y hacia atrás', () => {
      expect(addMonthsUtc(iso('2026-12-15T00:00:00.000Z'), 1).toISOString()).toBe(
        '2027-01-15T00:00:00.000Z',
      );
      expect(addMonthsUtc(iso('2026-01-15T00:00:00.000Z'), -1).toISOString()).toBe(
        '2025-12-15T00:00:00.000Z',
      );
      expect(addMonthsUtc(iso('2026-03-31T00:00:00.000Z'), -1).toISOString()).toBe(
        '2026-02-28T00:00:00.000Z',
      );
    });

    it('rechaza entradas inválidas', () => {
      expect(() => addMonthsUtc(new Date('no-es-fecha'), 1)).toThrow(RangeError);
      expect(() => addMonthsUtc(iso('2026-01-01T00:00:00.000Z'), 1.5)).toThrow(RangeError);
    });
  });

  describe('lastDayOfUtcMonth', () => {
    it('resuelve febrero en años comunes y bisiestos', () => {
      expect(lastDayOfUtcMonth(2026, 1)).toBe(28);
      expect(lastDayOfUtcMonth(2024, 1)).toBe(29);
      expect(lastDayOfUtcMonth(2026, 0)).toBe(31);
      expect(lastDayOfUtcMonth(2026, 3)).toBe(30);
    });
  });

  describe('computePeriodEnd', () => {
    it('siempre devuelve un instante posterior al inicio', () => {
      const startedAt = iso('2026-01-31T23:59:59.000Z');
      const periodEnd = computePeriodEnd(startedAt);
      expect(periodEnd.getTime()).toBeGreaterThan(startedAt.getTime());
      expect(periodEnd.toISOString()).toBe('2026-02-28T23:59:59.000Z');
    });

    it('admite períodos de varios meses', () => {
      expect(computePeriodEnd(iso('2026-01-31T00:00:00.000Z'), 12).toISOString()).toBe(
        '2027-01-31T00:00:00.000Z',
      );
    });
  });
});
