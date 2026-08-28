import {
  DERIVED_ATTRIBUTES,
  merchantSizeBand,
  projectMerchantAudience,
  tenureMonths,
} from './ads.audience-projection';
import { deliveryRequestSchema } from './ads.schemas';

/**
 * De dónde salen los atributos de un segmento.
 *
 * Lo que se fija aquí es una sola regla con consecuencia grande: **lo que la plataforma sabe pisa
 * lo que el llamante declara**. Sin ella, la segmentación deja de ser una propiedad del comercio y
 * pasa a ser una afirmación suya — quien pide el anuncio elige en qué segmentos entra.
 */

const FACTS = {
  category: 'ferreteria',
  businessLine: 'construccion',
  city: 'Santa Cruz',
  countryCode: 'BO',
  employeeCount: 30,
  foundedYear: 1998,
  createdAt: new Date('2026-02-20T00:00:00Z'),
};

const NOW = new Date('2026-08-20T00:00:00Z');

describe('proyección de audiencia del comercio', () => {
  it('deriva el segmento de los datos guardados, sin que el llamante mande nada', () => {
    const audience = projectMerchantAudience({ facts: FACTS, now: NOW });

    expect(audience).toEqual({
      merchantCategory: 'ferreteria',
      city: 'Santa Cruz',
      country: 'BO',
      merchantSizeBand: 'PEQUENA',
      tenureMonths: 6,
    });
  });

  /*
   * El caso que motiva todo esto: un integrador que declara el rubro de otro entraría en los
   * segmentos de ese rubro. Con la proyección, lo que manda es lo que dice su cuenta.
   */
  it('lo derivado gana a lo declarado', () => {
    const audience = projectMerchantAudience({
      facts: FACTS,
      declared: { merchantCategory: 'farmacia', city: 'La Paz', merchantSizeBand: 'GRANDE' },
      now: NOW,
    });

    expect(audience.merchantCategory).toBe('ferreteria');
    expect(audience.city).toBe('Santa Cruz');
    expect(audience.merchantSizeBand).toBe('PEQUENA');
  });

  /*
   * Y la otra mitad: lo que la plataforma NO puede saber sí se conserva. La superficie es del
   * momento de la petición —dónde se va a mostrar el anuncio—, no del comercio.
   */
  it('conserva lo que la plataforma no puede derivar', () => {
    const audience = projectMerchantAudience({
      facts: FACTS,
      declared: { surface: 'app-home', riskSegment: 'B' },
      now: NOW,
    });

    expect(audience.surface).toBe('app-home');
    expect(audience.riskSegment).toBe('B');
  });

  /* Un dato que la cuenta no tiene no se inventa: el atributo queda ausente y el segmento que lo
   * exija no se dará por cumplido, que es lo correcto. */
  it('no rellena lo que la cuenta no guarda', () => {
    const audience = projectMerchantAudience({
      facts: { ...FACTS, city: null, employeeCount: null },
      now: NOW,
    });

    expect(audience.city).toBeUndefined();
    expect(audience.merchantSizeBand).toBeUndefined();
  });

  /* Cuentas migradas sin rubro: la línea de negocio hace de respaldo antes que dejarlo vacío. */
  it('cae a la línea de negocio cuando no hay rubro cargado', () => {
    const audience = projectMerchantAudience({ facts: { ...FACTS, category: null }, now: NOW });

    expect(audience.merchantCategory).toBe('construccion');
  });

  describe('bandas de tamaño', () => {
    /* Se segmenta por banda y no por el número exacto: un umbral en 47 empleados no significa nada
     * y el dato fino permitiría reconstruir qué comercio es cada impresión. */
    it.each([
      [1, 'MICRO'],
      [10, 'MICRO'],
      [11, 'PEQUENA'],
      [50, 'PEQUENA'],
      [51, 'MEDIANA'],
      [200, 'MEDIANA'],
      [201, 'GRANDE'],
    ])('%i empleados cae en %s', (count, band) => {
      expect(merchantSizeBand(count)).toBe(band);
    });

    it('sin empleados declarados no hay banda', () => {
      expect(merchantSizeBand(null)).toBeUndefined();
      expect(merchantSizeBand(0)).toBeUndefined();
    });
  });

  describe('antigüedad', () => {
    /*
     * Se mide desde el alta en la PLATAFORMA y no desde el año de fundación: lo que un segmento de
     * antigüedad distingue es cuánto lleva el comercio operando con nosotros. Una ferretería de
     * 1980 que entró el mes pasado es un comercio nuevo.
     */
    it('cuenta meses desde el alta, no desde la fundación', () => {
      expect(tenureMonths(new Date('2026-02-20T00:00:00Z'), NOW)).toBe(6);
      expect(tenureMonths(new Date('2026-08-01T00:00:00Z'), NOW)).toBe(0);
    });

    /* Un alta con fecha futura —reloj desfasado, carga manual— daría antigüedad negativa, y un
     * negativo pasa cualquier comparación de «menos de N meses». Se acota en cero. */
    it('nunca devuelve una antigüedad negativa', () => {
      expect(tenureMonths(new Date('2027-01-01T00:00:00Z'), NOW)).toBe(0);
    });

    it('sin fecha de alta no hay antigüedad', () => {
      expect(tenureMonths(null, NOW)).toBeUndefined();
    });
  });

  it('la petición de entrega admite el comercio del que derivar', () => {
    /*
     * La proyección estuvo escrita y probada desde el principio sin que nadie la llamara: la
     * entrega segmentaba contra lo que el integrador declaraba. Este campo es el que permite
     * derivar, y por eso su presencia se fija aquí y no sólo en el esquema.
     */
    const conComercio = deliveryRequestSchema.safeParse({
      placementCode: 'MERCHANT_DASHBOARD_TOP_BANNER',
      merchantAccountId: '11111111-1111-4111-8111-111111111111',
      audience: { merchantCategory: 'FARMACIA' },
    });
    expect(conComercio.success).toBe(true);

    // Sigue siendo opcional: quien ya integraba no se rompe, sólo no obtiene la garantía.
    const sinComercio = deliveryRequestSchema.safeParse({
      placementCode: 'MERCHANT_DASHBOARD_TOP_BANNER',
      audience: { merchantCategory: 'FARMACIA' },
    });
    expect(sinComercio.success).toBe(true);
  });

  it('declara qué atributos deja de decidir el llamante', () => {
    // La lista es documentación ejecutable: si mañana se deriva uno más, esto obliga a decirlo.
    expect([...DERIVED_ATTRIBUTES]).toEqual([
      'merchantCategory',
      'city',
      'country',
      'merchantSizeBand',
      'tenureMonths',
    ]);
  });
});
