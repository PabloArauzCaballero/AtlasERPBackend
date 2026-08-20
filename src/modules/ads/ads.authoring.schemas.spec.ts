import {
  createAdSetSchema,
  createCampaignSchema,
  createCreativeSchema,
} from './ads.authoring.schemas';

/**
 * Validación del alta publicitaria.
 *
 * Antes no había nada que validar porque no había alta: la única forma de que existiera una
 * campaña era sembrarla por SQL, y ahí la base sólo defiende lo que su `CHECK` alcanza —un
 * presupuesto positivo— con un mensaje del driver que no nombra el campo.
 *
 * Lo que estas pruebas fijan es que cada rechazo diga QUÉ está mal y DÓNDE. Un 400 genérico sobre
 * un cuerpo con doce campos manda a quien integra a probar por eliminación.
 */
describe('Alta de la cadena publicitaria', () => {
  const campanaValida = {
    advertiserId: '11111111-1111-4111-8111-111111111111',
    name: 'Promoción de temporada',
    objective: 'TRAFFIC',
    currency: 'bob',
    budgetTotalMicros: 5_000_000,
    startsAt: '2026-09-01T00:00:00.000Z',
    endsAt: '2026-09-30T00:00:00.000Z',
  };

  describe('campaña', () => {
    it('acepta una campaña válida y normaliza la moneda', () => {
      const result = createCampaignSchema.safeParse(campanaValida);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.currency).toBe('BOB');
    });

    it('rechaza el presupuesto en cero nombrando el campo', () => {
      const result = createCampaignSchema.safeParse({ ...campanaValida, budgetTotalMicros: 0 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('mayor que cero');
      }
    });

    it('rechaza un tope diario por encima del total, apuntando a budgetDailyMicros', () => {
      // Es un límite que no limita: el gasto se corta antes en el total, así que el diario jamás
      // llegaría a aplicarse y la pantalla mostraría una restricción falsa.
      const result = createCampaignSchema.safeParse({
        ...campanaValida,
        budgetDailyMicros: 9_000_000,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual(['budgetDailyMicros']);
      }
    });

    it('rechaza que la campaña termine antes de empezar', () => {
      const result = createCampaignSchema.safeParse({
        ...campanaValida,
        endsAt: '2026-08-01T00:00:00.000Z',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0]?.path).toEqual(['endsAt']);
    });

    it('acepta una campaña sin fecha de fin: la indefinida es válida', () => {
      const { endsAt: _endsAt, ...sinFin } = campanaValida;
      expect(createCampaignSchema.safeParse(sinFin).success).toBe(true);
    });
  });

  describe('conjunto de anuncios', () => {
    const conjuntoValido = {
      name: 'Farmacias Santa Cruz',
      buyingModel: 'CPM',
      bidAmountMicros: 12_000,
      placementIds: ['22222222-2222-4222-8222-222222222222'],
    };

    it('exige las dos mitades del tope de frecuencia', () => {
      // La consulta de elegibilidad sólo aplica el tope cuando cantidad Y ventana están; declarar
      // una sola deja el conjunto pareciendo acotado sin estarlo.
      const result = createAdSetSchema.safeParse({ ...conjuntoValido, frequencyCapCount: 3 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual(['frequencyCapWindowHours']);
      }
      expect(
        createAdSetSchema.safeParse({
          ...conjuntoValido,
          frequencyCapCount: 3,
          frequencyCapWindowHours: 24,
        }).success,
      ).toBe(true);
    });

    it('rechaza una puja de cero salvo en compra FIXED', () => {
      expect(createAdSetSchema.safeParse({ ...conjuntoValido, bidAmountMicros: 0 }).success).toBe(
        false,
      );
      expect(
        createAdSetSchema.safeParse({
          ...conjuntoValido,
          buyingModel: 'FIXED',
          bidAmountMicros: 0,
        }).success,
      ).toBe(true);
    });

    it('exige al menos un espacio y rechaza repetidos', () => {
      expect(createAdSetSchema.safeParse({ ...conjuntoValido, placementIds: [] }).success).toBe(
        false,
      );
      const repetido = createAdSetSchema.safeParse({
        ...conjuntoValido,
        placementIds: [conjuntoValido.placementIds[0], conjuntoValido.placementIds[0]],
      });
      expect(repetido.success).toBe(false);
    });
  });

  describe('creatividad', () => {
    const creativaValida = {
      advertiserId: '11111111-1111-4111-8111-111111111111',
      name: 'Banner principal',
      creativeType: 'IMAGE',
      destinationUrl: 'https://comercio.example/promo',
    };

    it('acepta un destino http(s)', () => {
      expect(createCreativeSchema.safeParse(creativaValida).success).toBe(true);
    });

    it('rechaza un destino javascript:, que sería ejecución en el navegador de quien pulsa', () => {
      const result = createCreativeSchema.safeParse({
        ...creativaValida,
        destinationUrl: 'javascript:alert(1)',
      });
      expect(result.success).toBe(false);
    });
  });
});
