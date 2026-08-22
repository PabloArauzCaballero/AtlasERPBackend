import { audienceMatchesSegment, requiredPrivacyLevel } from './ads.segmentation';
import type { EvaluableSegment, SegmentDefinition } from './ads.segmentation';
import { audienceContextSchema, createTargetSegmentSchema } from './ads.segmentation.schemas';

/**
 * La segmentación publicitaria: qué se puede declarar y a quién alcanza.
 *
 * El módulo tenía la tabla `ad_target_segments`, el modelo, y la llave foránea desde el conjunto de
 * anuncios — y nada más: ni endpoint que creara un segmento, ni una línea que lo leyera al decidir
 * qué anuncio servir. Un conjunto "segmentado" se entregaba exactamente igual que uno abierto.
 *
 * Estas pruebas fijan las dos mitades de la corrección. La primera —qué se admite— importa porque
 * una definición mal formada guardada en JSONB no falla: se queda ahí y produce una campaña que no
 * entrega sin que nadie sepa por qué. La segunda —a quién alcanza— porque el error contrario, dar
 * por buena una regla que no se puede comprobar, entrega la campaña a quien no debía y no deja
 * rastro de nada.
 */
describe('Segmentación de audiencia publicitaria', () => {
  function segment(definition: SegmentDefinition): EvaluableSegment {
    return { segmentType: 'CORPORATE_CONTEXTUAL', definitionJson: definition };
  }

  describe('a quién alcanza un segmento', () => {
    it('sin segmento, el conjunto entrega a todo el mundo', () => {
      expect(audienceMatchesSegment(null, { merchantCategory: 'FARMACIA' })).toBe(true);
      expect(audienceMatchesSegment(undefined, undefined)).toBe(true);
    });

    it('un atributo que la petición NO manda no cumple la regla', () => {
      // La decisión de diseño más consecuente del módulo. Si esto devolviera `true`, un ad server
      // que dejara de enviar el contexto seguiría entregando y una campaña restringida a farmacias
      // pasaría a servirse a todo el mundo, sin fallo visible en ninguna parte.
      const restringido = segment({
        match: 'ALL',
        rules: [{ attribute: 'merchantCategory', operator: 'EQUALS', value: 'FARMACIA' }],
      });
      expect(audienceMatchesSegment(restringido, {})).toBe(false);
      expect(audienceMatchesSegment(restringido, undefined)).toBe(false);
    });

    it('compara texto sin distinguir mayúsculas ni espacios sobrantes', () => {
      const farmacias = segment({
        match: 'ALL',
        rules: [{ attribute: 'merchantCategory', operator: 'EQUALS', value: 'FARMACIA' }],
      });
      expect(audienceMatchesSegment(farmacias, { merchantCategory: '  farmacia ' })).toBe(true);
      expect(audienceMatchesSegment(farmacias, { merchantCategory: 'FERRETERIA' })).toBe(false);
    });

    it('ALL exige todas las reglas y ANY basta con una', () => {
      const rules: SegmentDefinition['rules'] = [
        { attribute: 'merchantCategory', operator: 'IN', value: ['FARMACIA', 'MERCADO'] },
        { attribute: 'city', operator: 'EQUALS', value: 'Santa Cruz' },
      ];
      const audiencia = { merchantCategory: 'FARMACIA', city: 'La Paz' };
      expect(audienceMatchesSegment(segment({ match: 'ALL', rules }), audiencia)).toBe(false);
      expect(audienceMatchesSegment(segment({ match: 'ANY', rules }), audiencia)).toBe(true);
    });

    it('BETWEEN acota por rango numérico, inclusive en los extremos', () => {
      const maduros = segment({
        match: 'ALL',
        rules: [{ attribute: 'tenureMonths', operator: 'BETWEEN', value: [12, 36] }],
      });
      expect(audienceMatchesSegment(maduros, { tenureMonths: 12 })).toBe(true);
      expect(audienceMatchesSegment(maduros, { tenureMonths: 36 })).toBe(true);
      expect(audienceMatchesSegment(maduros, { tenureMonths: 11 })).toBe(false);
    });

    it('NOT_IN excluye, y sigue exigiendo que el atributo venga', () => {
      const excluidos = segment({
        match: 'ALL',
        rules: [{ attribute: 'riskSegment', operator: 'NOT_IN', value: ['ALTO', 'CRITICO'] }],
      });
      expect(audienceMatchesSegment(excluidos, { riskSegment: 'BAJO' })).toBe(true);
      expect(audienceMatchesSegment(excluidos, { riskSegment: 'ALTO' })).toBe(false);
      // Sin el dato no se puede afirmar que NO esté en la lista: fail-closed también aquí.
      expect(audienceMatchesSegment(excluidos, {})).toBe(false);
    });

    it('una definición sin reglas no restringe nada', () => {
      expect(audienceMatchesSegment(segment({ match: 'ALL', rules: [] }), {})).toBe(true);
    });
  });

  describe('qué se admite al dar de alta un segmento', () => {
    const base = {
      name: 'Farmacias de Santa Cruz',
      segmentType: 'MERCHANT_CATEGORY' as const,
      definition: {
        match: 'ALL' as const,
        rules: [
          { attribute: 'merchantCategory' as const, operator: 'IN' as const, value: ['FARMACIA'] },
        ],
      },
    };

    it('acepta una definición válida y deriva el nivel de privacidad', () => {
      const result = createTargetSegmentSchema.safeParse(base);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.privacyLevel).toBe('CORPORATE_CONTEXTUAL');
    });

    it('rechaza un atributo que el tipo de segmento no admite, diciendo cuáles sí', () => {
      const result = createTargetSegmentSchema.safeParse({
        ...base,
        definition: {
          match: 'ALL',
          rules: [{ attribute: 'monthlyVolumeBand', operator: 'EQUALS', value: 'ALTA' }],
        },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        // El mensaje tiene que nombrar el atributo Y la lista admitida: un "definición inválida"
        // deja a quien integra probando a ciegas.
        expect(result.error.issues[0]?.message).toContain('monthlyVolumeBand');
        expect(result.error.issues[0]?.message).toContain('merchantCategory');
      }
    });

    it('rechaza un atributo que no existe en el vocabulario', () => {
      const result = createTargetSegmentSchema.safeParse({
        ...base,
        definition: {
          match: 'ALL',
          rules: [{ attribute: 'cedulaDeIdentidad', operator: 'EQUALS', value: '123' }],
        },
      });
      expect(result.success).toBe(false);
    });

    it('rechaza IN sin lista: parecería un filtro y no filtraría nada', () => {
      const result = createTargetSegmentSchema.safeParse({
        ...base,
        definition: {
          match: 'ALL',
          rules: [{ attribute: 'merchantCategory', operator: 'IN', value: 'FARMACIA' }],
        },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.message.includes('lista'))).toBe(true);
      }
    });

    it('rechaza BETWEEN sobre un atributo de texto', () => {
      const result = createTargetSegmentSchema.safeParse({
        name: 'Rango imposible',
        segmentType: 'GEO',
        definition: {
          match: 'ALL',
          rules: [{ attribute: 'city', operator: 'BETWEEN', value: [1, 5] }],
        },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.message.includes('numéricos'))).toBe(true);
      }
    });

    it('rechaza EXISTS con valor, y el operador que exige valor sin él', () => {
      const conValor = createTargetSegmentSchema.safeParse({
        ...base,
        definition: {
          match: 'ALL',
          rules: [{ attribute: 'merchantCategory', operator: 'EXISTS', value: 'FARMACIA' }],
        },
      });
      const sinValor = createTargetSegmentSchema.safeParse({
        ...base,
        definition: {
          match: 'ALL',
          rules: [{ attribute: 'merchantCategory', operator: 'EQUALS' }],
        },
      });
      expect(conValor.success).toBe(false);
      expect(sinValor.success).toBe(false);
    });

    it('un segmento sobre huella de cliente exige el nivel de privacidad estricto', () => {
      const definition = {
        match: 'ALL' as const,
        rules: [
          {
            attribute: 'corporateClientHash' as const,
            operator: 'IN' as const,
            value: ['a'.repeat(32)],
          },
        ],
      };
      expect(requiredPrivacyLevel(definition)).toBe('HASHED_ALLOWLIST');

      // Declararlo como contextual es un error, no una preferencia: sería etiquetar como
      // "sin datos de cliente" un segmento que apunta a clientes concretos por su huella.
      const mintiendo = createTargetSegmentSchema.safeParse({
        name: 'Lista blanca',
        segmentType: 'CUSTOM_ALLOWLIST',
        privacyLevel: 'CORPORATE_CONTEXTUAL',
        definition,
      });
      expect(mintiendo.success).toBe(false);

      const honesto = createTargetSegmentSchema.safeParse({
        name: 'Lista blanca',
        segmentType: 'CUSTOM_ALLOWLIST',
        definition,
      });
      expect(honesto.success).toBe(true);
      if (honesto.success) expect(honesto.data.privacyLevel).toBe('HASHED_ALLOWLIST');
    });
  });

  describe('el contexto que manda el ad server', () => {
    it('rechaza un atributo desconocido en vez de ignorarlo', () => {
      // Ignorarlo dejaría a quien integra creyendo que segmenta por un dato que el motor tira.
      const result = audienceContextSchema.safeParse({
        merchantCategory: 'FARMACIA',
        nombreDelDueno: 'Ana',
      });
      expect(result.success).toBe(false);
    });

    it('acepta el contexto vacío: no segmentar es legítimo', () => {
      expect(audienceContextSchema.safeParse({}).success).toBe(true);
    });
  });
});
