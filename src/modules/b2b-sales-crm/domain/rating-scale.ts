/**
 * Escala de calificación de cartera: bandas, categoría y previsión.
 *
 * Funciones puras. No consultan la base ni el reloj del sistema — la fecha de corte se pasa como
 * argumento — para que la calificación sea verificable con una tabla de casos y no con un entorno.
 */

/** Una banda de la matriz, tal como se leyó de `rating_policy_bands`. */
export interface RatingBand {
  grade: string;
  gradeLabel: string;
  severityRank: number;
  minDaysPastDue: number;
  /** `null` = la banda no tiene tope: es la última de la escala. */
  maxDaysPastDue: number | null;
  /** Porcentaje de previsión en tanto por uno (0.20 = 20 %). */
  provisionRate: number;
}

export interface ReceivableRatingInput {
  daysPastDue: number;
  /** Saldo abierto en céntimos. Se trabaja en enteros: la previsión no puede nacer de un float. */
  exposureCents: number;
  /** Un vencimiento en disputa no se califica por mora: el atraso no es del deudor todavía. */
  disputed: boolean;
}

export interface ReceivableRating {
  band: RatingBand;
  daysPastDue: number;
  exposureCents: number;
  provisionCents: number;
  reason: 'DAYS_PAST_DUE' | 'DISPUTED';
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Días de mora de un vencimiento, contados por DÍA DE CALENDARIO en UTC.
 *
 * Restar milisegundos y dividir parece equivalente y no lo es: con horas distintas, un vencimiento
 * de ayer a las 23:00 mirado hoy a las 08:00 daría 0 días y no 1. La mora se cuenta en días del
 * calendario, así que ambas fechas se truncan antes de restar.
 */
export function daysPastDueFor(dueDate: string, asOf: Date): number {
  const due = Date.parse(`${dueDate}T00:00:00.000Z`);
  if (!Number.isFinite(due)) {
    throw new Error(`Fecha de vencimiento inválida: ${dueDate}`);
  }
  const today = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  const days = Math.floor((today - due) / MILLISECONDS_PER_DAY);
  return days > 0 ? days : 0;
}

/**
 * Ordena la escala de mejor a peor y comprueba que sea utilizable.
 *
 * Una escala con huecos no falla al calificar: devuelve la banda equivocada para los días que nadie
 * cubrió, y lo hace en silencio. Una cuenta con 45 días de mora sobre una matriz que salta de 30 a
 * 61 caería donde toque según cómo se recorra, y en ambos casos el resultado es una previsión
 * inventada. Por eso la validación es parte de cargar la política y no un chequeo opcional: una
 * matriz mal definida tiene que fallar al aprobarse, no al calificar la cartera.
 */
export function normalizeScale(bands: readonly RatingBand[]): RatingBand[] {
  const ordered = [...bands].sort((a, b) => a.severityRank - b.severityRank);
  const first = ordered.at(0);
  const last = ordered.at(-1);

  if (!first || !last) {
    throw new Error('La política de calificación no tiene bandas definidas.');
  }
  if (first.minDaysPastDue !== 0) {
    throw new Error('La primera banda de la escala debe empezar en 0 días de mora.');
  }
  if (last.maxDaysPastDue !== null) {
    throw new Error('La última banda de la escala debe ser abierta (sin tope de días).');
  }

  ordered.forEach((current, index) => {
    const next = ordered.at(index + 1);
    if (!next) {
      return;
    }
    if (current.maxDaysPastDue === null) {
      throw new Error(`La banda ${current.grade} es abierta pero no es la última de la escala.`);
    }
    if (next.minDaysPastDue !== current.maxDaysPastDue + 1) {
      throw new Error(
        `La escala tiene un hueco o un solape entre ${current.grade} y ${next.grade}.`,
      );
    }
  });

  return ordered;
}

/*
 * Aquí estaba `worstBand` —la peor banda de la ESCALA— y no la llamaba nadie: lo que el motor
 * necesita es la peor DEUDA del cliente (`worstReceivable`, en `account-rating.ts`), que es otra
 * cosa. Tenerlas las dos, con nombres casi iguales y una sin usar, es una invitación a coger la
 * equivocada el día que haga falta arrastrar una categoría.
 */

/** La banda que corresponde a unos días de mora. La escala ya se validó: siempre hay una. */
export function bandForDaysPastDue(bands: readonly RatingBand[], daysPastDue: number): RatingBand {
  const ordered = normalizeScale(bands);
  const days = Math.max(0, daysPastDue);
  const match = ordered.find(
    (band) =>
      days >= band.minDaysPastDue && (band.maxDaysPastDue === null || days <= band.maxDaysPastDue),
  );
  // `normalizeScale` garantiza cobertura continua desde 0 hasta infinito, así que esto es
  // inalcanzable; queda como aserción para que un cambio futuro en la validación falle diciendo qué
  // pasó, en vez de devolver `undefined` disfrazado de banda.
  if (!match) {
    throw new Error(`Ninguna banda cubre ${days} días de mora.`);
  }
  return match;
}

/**
 * Previsión en céntimos: exposición × tasa, redondeada al céntimo más cercano.
 *
 * Se redondea al final y sobre enteros. Multiplicar importes con coma flotante y sumar después
 * produce diferencias de céntimos que en un cierre no cuadran contra el libro mayor, y el descuadre
 * aparece meses más tarde sin forma de atribuirlo.
 */
export function provisionCentsFor(exposureCents: number, provisionRate: number): number {
  if (exposureCents <= 0) {
    return 0;
  }
  return Math.round(exposureCents * provisionRate);
}

/**
 * Califica UN vencimiento.
 *
 * Un vencimiento en DISPUTA se congela en la banda que le tocaría hoy pero se marca como tal: el
 * atraso existe, pero mientras el comercio impugna el importe no es evidencia de que no vaya a
 * pagar. Sacarlo del cálculo escondería exposición real; tratarlo como mora normal castigaría al
 * cliente por un error de facturación propio.
 */
export function rateReceivable(
  bands: readonly RatingBand[],
  input: ReceivableRatingInput,
): ReceivableRating {
  const band = bandForDaysPastDue(bands, input.daysPastDue);
  const exposureCents = Math.max(0, input.exposureCents);
  return {
    band,
    daysPastDue: Math.max(0, input.daysPastDue),
    exposureCents,
    provisionCents: provisionCentsFor(exposureCents, band.provisionRate),
    reason: input.disputed ? 'DISPUTED' : 'DAYS_PAST_DUE',
  };
}
