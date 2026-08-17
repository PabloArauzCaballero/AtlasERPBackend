import type { RatingBand, ReceivableRating } from './rating-scale';

/** Un vencimiento ya calificado, con la identidad que permite decir cuál arrastró a la cuenta. */
export interface RatedReceivable {
  receivableId: string;
  rating: ReceivableRating;
}

export interface AccountRating {
  band: RatingBand;
  worstDaysPastDue: number;
  ratedReceivableCount: number;
  totalExposureCents: number;
  totalProvisionCents: number;
  /** El vencimiento que fijó la categoría. Sin él, «por qué me bajaron» no tiene respuesta. */
  drivingReceivableId: string | null;
  reason: 'WORST_RECEIVABLE' | 'NO_OPEN_DEBT';
}

/**
 * Califica a la CUENTA B2B a partir de sus vencimientos calificados.
 *
 * La regla es de arrastre (contaminación): la cuenta toma la PEOR categoría de sus vencimientos, no
 * el promedio ni la ponderada por saldo. La razón no es normativa sino aritmética: un comercio con
 * nueve facturas pequeñas al día y una grande con 200 días de mora promedia «bueno», y ese promedio
 * describe a un cliente que no existe. Lo que ocurrió es que dejó de pagar, y esa es la señal que
 * sirve para decidir si se le sigue dando línea.
 *
 * `applyContamination = false` es la excepción explícita para carteras que califican documento a
 * documento. Viene de la política versionada y queda escrita en la fila, porque una cuenta calificada
 * con arrastre y otra sin él no son comparables y hay que poder distinguirlas.
 *
 * Sin deuda abierta la cuenta NO se queda sin calificación: cae en la mejor banda con
 * `NO_OPEN_DEBT`. Devolver un hueco obligaría a cada consumidor a inventar qué significa, y el que
 * lo interpretara como «sin datos = riesgoso» castigaría a quien acaba de pagar todo.
 */
export function rateAccount(input: {
  receivables: readonly RatedReceivable[];
  bestBand: RatingBand;
  applyContamination: boolean;
}): AccountRating {
  if (input.receivables.length === 0) {
    return {
      band: input.bestBand,
      worstDaysPastDue: 0,
      ratedReceivableCount: 0,
      totalExposureCents: 0,
      totalProvisionCents: 0,
      drivingReceivableId: null,
      reason: 'NO_OPEN_DEBT',
    };
  }

  const totals = input.receivables.reduce(
    (accumulator, item) => ({
      exposure: accumulator.exposure + item.rating.exposureCents,
      provision: accumulator.provision + item.rating.provisionCents,
    }),
    { exposure: 0, provision: 0 },
  );

  const driver = input.applyContamination
    ? worstReceivable(input.receivables)
    : largestReceivable(input.receivables);

  return {
    band: driver.rating.band,
    worstDaysPastDue: input.receivables.reduce(
      (worst, item) => Math.max(worst, item.rating.daysPastDue),
      0,
    ),
    ratedReceivableCount: input.receivables.length,
    totalExposureCents: totals.exposure,
    totalProvisionCents: totals.provision,
    drivingReceivableId: driver.receivableId,
    reason: 'WORST_RECEIVABLE',
  };
}

/**
 * El peor vencimiento. Ante empate de categoría manda el de mayor saldo abierto.
 *
 * El desempate importa porque `drivingReceivableId` es lo que se le muestra al ejecutivo como la
 * causa: entre dos facturas igual de deterioradas, la que explica la calificación es la que pone el
 * dinero en juego. Sin criterio explícito, la respuesta dependería del orden en que la consulta
 * devolvió las filas y cambiaría entre dos lecturas idénticas.
 */
function worstReceivable(receivables: readonly RatedReceivable[]): RatedReceivable {
  return receivables.reduce((worst, item) => {
    if (item.rating.band.severityRank !== worst.rating.band.severityRank) {
      return item.rating.band.severityRank > worst.rating.band.severityRank ? item : worst;
    }
    return item.rating.exposureCents > worst.rating.exposureCents ? item : worst;
  });
}

/** Sin arrastre, la calificación la fija el vencimiento de mayor saldo abierto. */
function largestReceivable(receivables: readonly RatedReceivable[]): RatedReceivable {
  return receivables.reduce((largest, item) =>
    item.rating.exposureCents > largest.rating.exposureCents ? item : largest,
  );
}
