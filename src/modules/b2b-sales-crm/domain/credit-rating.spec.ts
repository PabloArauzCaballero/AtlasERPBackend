import { rateAccount, type RatedReceivable } from './account-rating';
import {
  bandForDaysPastDue,
  daysPastDueFor,
  normalizeScale,
  provisionCentsFor,
  rateReceivable,
  worstBand,
  type RatingBand,
} from './rating-scale';

/** La escala A–F sembrada como política activa. Es la que califica en producción. */
const ASFI: RatingBand[] = [
  {
    grade: 'A',
    gradeLabel: 'Normal',
    severityRank: 0,
    minDaysPastDue: 0,
    maxDaysPastDue: 0,
    provisionRate: 0.01,
  },
  {
    grade: 'B',
    gradeLabel: 'Riesgo potencial',
    severityRank: 1,
    minDaysPastDue: 1,
    maxDaysPastDue: 30,
    provisionRate: 0.05,
  },
  {
    grade: 'C',
    gradeLabel: 'Deficiente',
    severityRank: 2,
    minDaysPastDue: 31,
    maxDaysPastDue: 60,
    provisionRate: 0.2,
  },
  {
    grade: 'D',
    gradeLabel: 'Dudoso',
    severityRank: 3,
    minDaysPastDue: 61,
    maxDaysPastDue: 90,
    provisionRate: 0.5,
  },
  {
    grade: 'E',
    gradeLabel: 'Pérdida',
    severityRank: 4,
    minDaysPastDue: 91,
    maxDaysPastDue: 180,
    provisionRate: 0.8,
  },
  {
    grade: 'F',
    gradeLabel: 'Pérdida irrecuperable',
    severityRank: 5,
    minDaysPastDue: 181,
    maxDaysPastDue: null,
    provisionRate: 1,
  },
];

describe('daysPastDueFor', () => {
  it('cuenta días de calendario, no fracciones de milisegundos', () => {
    // Venció ayer a las 00:00 y son las 08:00 de hoy: es 1 día de mora, no 0.
    expect(daysPastDueFor('2026-08-15', new Date('2026-08-16T08:00:00Z'))).toBe(1);
    expect(daysPastDueFor('2026-08-16', new Date('2026-08-16T23:59:00Z'))).toBe(0);
  });

  it('un vencimiento futuro no está en mora', () => {
    expect(daysPastDueFor('2026-12-01', new Date('2026-08-16T00:00:00Z'))).toBe(0);
  });

  it('rechaza una fecha ilegible en vez de devolver NaN', () => {
    expect(() => daysPastDueFor('no-es-fecha', new Date())).toThrow(/inválida/);
  });
});

describe('normalizeScale', () => {
  it('ordena por severidad aunque lleguen desordenadas de la base', () => {
    const shuffled = [ASFI[3], ASFI[0], ASFI[5], ASFI[1], ASFI[4], ASFI[2]] as RatingBand[];
    expect(normalizeScale(shuffled).map((band) => band.grade)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
    ]);
  });

  it('rechaza un HUECO en la escala en vez de calificar mal en silencio', () => {
    // De 30 salta a 61: nadie cubre los días 31–60, y una factura con 45 caería donde toque.
    expect(() => normalizeScale(ASFI.filter((band) => band.grade !== 'C'))).toThrow(
      /hueco o un solape/,
    );
  });

  it('rechaza un SOLAPE entre bandas', () => {
    const overlapping = ASFI.map((band) =>
      band.grade === 'C' ? { ...band, minDaysPastDue: 20 } : band,
    );
    expect(() => normalizeScale(overlapping)).toThrow(/hueco o un solape/);
  });

  it('exige que la escala empiece en 0 y termine abierta', () => {
    expect(() =>
      normalizeScale(ASFI.map((b) => (b.grade === 'A' ? { ...b, minDaysPastDue: 1 } : b))),
    ).toThrow(/empezar en 0/);
    expect(() =>
      normalizeScale(ASFI.map((b) => (b.grade === 'F' ? { ...b, maxDaysPastDue: 365 } : b))),
    ).toThrow(/abierta/);
  });

  it('rechaza una escala vacía', () => {
    expect(() => normalizeScale([])).toThrow(/no tiene bandas/);
  });
});

describe('bandForDaysPastDue', () => {
  it.each([
    [0, 'A'],
    [1, 'B'],
    [30, 'B'],
    [31, 'C'],
    [60, 'C'],
    [61, 'D'],
    [90, 'D'],
    [91, 'E'],
    [180, 'E'],
    [181, 'F'],
    [3650, 'F'],
  ])('con %i días de mora califica %s', (days, grade) => {
    expect(bandForDaysPastDue(ASFI, days).grade).toBe(grade);
  });
});

describe('provisionCentsFor', () => {
  it('calcula sobre céntimos enteros y redondea al céntimo', () => {
    expect(provisionCentsFor(300_000, 0.2)).toBe(60_000);
    expect(provisionCentsFor(333_333, 0.2)).toBe(66_667);
  });

  it('sin saldo abierto no hay previsión, aunque la tasa sea del 100 %', () => {
    expect(provisionCentsFor(0, 1)).toBe(0);
  });
});

describe('rateReceivable', () => {
  it('califica por mora y congela la previsión del momento', () => {
    const rating = rateReceivable(ASFI, {
      daysPastDue: 45,
      exposureCents: 300_000,
      disputed: false,
    });
    expect(rating.band.grade).toBe('C');
    expect(rating.provisionCents).toBe(60_000);
    expect(rating.reason).toBe('DAYS_PAST_DUE');
  });

  it('marca la disputa sin sacarla del cálculo: la exposición sigue existiendo', () => {
    const rating = rateReceivable(ASFI, {
      daysPastDue: 45,
      exposureCents: 300_000,
      disputed: true,
    });
    expect(rating.reason).toBe('DISPUTED');
    expect(rating.exposureCents).toBe(300_000);
    expect(rating.band.grade).toBe('C');
  });
});

describe('worstBand', () => {
  it('es la de mayor severidad, no la última del array', () => {
    const shuffled = [ASFI[3], ASFI[0], ASFI[5], ASFI[1], ASFI[4], ASFI[2]] as RatingBand[];
    expect(worstBand(shuffled).grade).toBe('F');
  });
});

function receivable(
  id: string,
  band: RatingBand,
  exposureCents: number,
  daysPastDue = 0,
): RatedReceivable {
  return {
    receivableId: id,
    rating: {
      band,
      daysPastDue,
      exposureCents,
      provisionCents: Math.round(exposureCents * band.provisionRate),
      reason: 'DAYS_PAST_DUE',
    },
  };
}

describe('rateAccount con arrastre', () => {
  const BAND_A = ASFI[0] as RatingBand;
  const BAND_C = ASFI[2] as RatingBand;
  const BAND_F = ASFI[5] as RatingBand;

  it('hereda la PEOR categoría, no el promedio', () => {
    // Nueve facturas pequeñas al día y una grande en pérdida. Un promedio dejaría al comercio en
    // categoría buena y se le seguiría dando línea; lo que ocurrió es que dejó de pagar.
    const receivables = [
      ...Array.from({ length: 9 }, (_unused, index) => receivable(`r${index + 1}`, BAND_A, 10_000)),
      receivable('r10', BAND_F, 500_000, 400),
    ];

    const rating = rateAccount({ receivables, bestBand: BAND_A, applyContamination: true });

    expect(rating.band.grade).toBe('F');
    expect(rating.drivingReceivableId).toBe('r10');
    expect(rating.reason).toBe('WORST_RECEIVABLE');
  });

  it('suma exposición y previsión de TODAS las deudas, no sólo la peor', () => {
    const rating = rateAccount({
      receivables: [receivable('r1', BAND_A, 100_000), receivable('r2', BAND_C, 300_000, 45)],
      bestBand: BAND_A,
      applyContamination: true,
    });

    expect(rating.totalExposureCents).toBe(400_000);
    expect(rating.totalProvisionCents).toBe(1_000 + 60_000);
    expect(rating.worstDaysPastDue).toBe(45);
    expect(rating.ratedReceivableCount).toBe(2);
  });

  it('ante empate de categoría, arrastra el de MAYOR saldo abierto', () => {
    const rating = rateAccount({
      receivables: [receivable('r1', BAND_C, 100_000, 45), receivable('r2', BAND_C, 900_000, 45)],
      bestBand: BAND_A,
      applyContamination: true,
    });
    expect(rating.drivingReceivableId).toBe('r2');
  });

  it('no deja sin calificación a la cuenta sin deuda abierta: cae en la mejor banda', () => {
    const rating = rateAccount({ receivables: [], bestBand: BAND_A, applyContamination: true });

    expect(rating.band.grade).toBe('A');
    expect(rating.reason).toBe('NO_OPEN_DEBT');
    expect(rating.drivingReceivableId).toBeNull();
    expect(rating.totalExposureCents).toBe(0);
  });

  it('sin arrastre califica por la deuda de mayor saldo, no por la peor', () => {
    const rating = rateAccount({
      receivables: [receivable('r1', BAND_A, 900_000), receivable('r2', BAND_F, 10_000, 400)],
      bestBand: BAND_A,
      applyContamination: false,
    });

    expect(rating.band.grade).toBe('A');
    expect(rating.drivingReceivableId).toBe('r1');
    // El peor atraso se sigue reportando: cambia el criterio de categoría, no el hecho observado.
    expect(rating.worstDaysPastDue).toBe(400);
  });
});
