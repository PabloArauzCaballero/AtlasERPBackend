import type { AudienceContext } from './ads.segmentation';
import { merchantSizeBand, tenureMonths } from '../../common/segmentation/business-bands';

/* Las bandas son de la plataforma, no de publicidad: se re-exportan para no cambiar de sitio a
 * quien ya las importaba desde aquí. */
export { merchantSizeBand, tenureMonths };

/**
 * De dónde salen de verdad los atributos de un segmento.
 *
 * ## El agujero que cierra
 *
 * `deliveryRequestSchema.audience` lo manda QUIEN PIDE el anuncio, y nada lo contrasta contra lo
 * que la plataforma ya sabe del comercio. Eso tiene dos consecuencias, y las dos son silenciosas:
 *
 * 1. **Se puede declarar cualquier cosa.** Un integrador que mande `merchantCategory: "farmacia"`
 *    entra en los segmentos de farmacia aunque su cuenta diga «ferretería». La segmentación deja
 *    de ser una propiedad del comercio y pasa a ser una afirmación suya.
 * 2. **Si no lo manda, no pasa nada visible.** El conjunto de anuncios con segmento simplemente
 *    deja de ser elegible —una regla que no se puede comprobar no se da por cumplida—, así que la
 *    campaña no se entrega y nadie ve un error.
 *
 * Los datos para responder ya están guardados: rubro, ciudad, país, antigüedad y tamaño viven en
 * la cuenta B2B desde que se dio de alta. El segmento se **deriva** de ahí.
 *
 * ## La regla: lo derivado gana a lo declarado
 *
 * Lo que la plataforma sabe pisa lo que el llamante dice. Sólo se conserva del llamante lo que la
 * plataforma NO puede saber —la superficie donde se va a mostrar el anuncio, el hash de contexto—,
 * porque eso es del momento de la petición y no del comercio.
 *
 * Es el mismo criterio que ya rige en el resto de la plataforma: el alcance de un comercio sale de
 * sus membresías y no de un identificador que mande el navegador.
 */

/** Lo que la cuenta guarda y sirve para segmentar. Nada de esto es dato personal. */
export interface StoredMerchantFacts {
  readonly category: string | null;
  readonly businessLine: string | null;
  readonly city: string | null;
  readonly countryCode: string | null;
  readonly employeeCount: number | null;
  readonly foundedYear: number | null;
  /** Alta de la cuenta en la plataforma, para la antigüedad. */
  readonly createdAt: Date | null;
}

/**
 * Proyecta los datos guardados del comercio al contexto de segmentación.
 *
 * `declared` es lo que mandó el llamante: se conserva sólo en los atributos que la plataforma no
 * puede derivar. Todo lo que sí sabe, lo impone.
 */
export function projectMerchantAudience(input: {
  facts: StoredMerchantFacts;
  declared?: AudienceContext;
  now?: Date;
}): AudienceContext {
  const now = input.now ?? new Date();
  const { facts } = input;

  const derived: AudienceContext = {};
  // `category` es el rubro comercial; `businessLine` afina dentro de él y se usa como respaldo
  // cuando el rubro no está cargado, que ocurre en cuentas migradas.
  const category = facts.category ?? facts.businessLine;
  if (category) derived.merchantCategory = category;
  if (facts.city) derived.city = facts.city;
  if (facts.countryCode) derived.country = facts.countryCode;

  const size = merchantSizeBand(facts.employeeCount);
  if (size) derived.merchantSizeBand = size;

  const tenure = tenureMonths(facts.createdAt, now);
  if (tenure !== undefined) derived.tenureMonths = tenure;

  /*
   * El orden importa y es la regla entera: primero lo declarado, después lo derivado ENCIMA. Al
   * revés, un llamante podría declarar su rubro y ganarle a la cuenta, que es exactamente lo que
   * esta proyección existe para impedir.
   */
  return { ...input.declared, ...derived };
}

/** Atributos que la plataforma deriva y que, por tanto, el llamante ya no decide. */
export const DERIVED_ATTRIBUTES = [
  'merchantCategory',
  'city',
  'country',
  'merchantSizeBand',
  'tenureMonths',
] as const;
