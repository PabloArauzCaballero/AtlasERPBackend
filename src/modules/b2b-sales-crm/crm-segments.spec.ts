import { matchesDefinition } from '../../common/segmentation/rule-engine';
import type { SegmentDefinition } from '../../common/segmentation/rule-engine';
import {
  ATTRIBUTES_BY_SUBJECT,
  CRM_SEGMENT_ATTRIBUTES,
  segmentVocabulary,
  type CrmSegmentAttribute,
} from './domain/crm-segments';
import { createCrmSegmentSchema, updateCrmSegmentSchema } from './b2b-sales-crm.schemas';
import { describeDefinition } from './services/crm-segments.service';

/**
 * Segmentación comercial: a quién agrupa cada segmento y qué puede mirar.
 *
 * El ERP llamaba «usuarios» a tres poblaciones distintas —el usuario interno que opera el sistema,
 * el partner con el que hay contrato y el cliente que solicita crédito— y sólo sabía segmentar
 * una: la audiencia publicitaria. Estas pruebas fijan la separación en el sitio donde de verdad
 * puede romperse, que no es el rótulo de la pantalla sino la gramática: un segmento de partners no
 * puede mirar la mora de un solicitante, y uno de solicitantes no puede mirar el territorio
 * comercial de una cuenta. Si eso se cuela, el segmento valida, se guarda y cuenta cero para
 * siempre sin que nada falle.
 */
describe('Segmentación comercial del ERP', () => {
  const partnerBase = {
    subject: 'PARTNER' as const,
    name: 'Farmacias de Santa Cruz',
    definition: {
      match: 'ALL' as const,
      rules: [{ attribute: 'category', operator: 'IN' as const, value: ['FARMACIA'] }],
    },
  };

  describe('qué puede mirar cada sujeto', () => {
    it('ningún atributo pertenece a los dos sujetos a la vez', () => {
      // Si un nombre significara dos cosas según el sujeto, un segmento copiado de uno a otro
      // seguiría validando y contaría otra población sin avisar.
      const partner = new Set(ATTRIBUTES_BY_SUBJECT.PARTNER);
      const solapados = ATTRIBUTES_BY_SUBJECT.CREDIT_APPLICANT.filter((name) => partner.has(name));
      expect(solapados).toEqual([]);
    });

    it('el vocabulario declarado y el publicado a la pantalla son el mismo', () => {
      const publicado = segmentVocabulary().flatMap((entry) =>
        entry.attributes.map((attribute) => attribute.name),
      );
      expect(publicado.sort()).toEqual(Object.keys(CRM_SEGMENT_ATTRIBUTES).sort());
    });

    it('rechaza en un segmento de partners un atributo del solicitante, diciendo cuáles sí', () => {
      const result = createCrmSegmentSchema.safeParse({
        ...partnerBase,
        definition: {
          match: 'ALL',
          rules: [{ attribute: 'maxDaysPastDue', operator: 'BETWEEN', value: [30, 90] }],
        },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const mensaje = result.error.issues.map((issue) => issue.message).join(' | ');
        expect(mensaje).toContain('maxDaysPastDue');
        expect(mensaje).toContain('partners');
        expect(mensaje).toContain('riskTier');
      }
    });

    it('rechaza en un segmento de solicitantes un atributo del partner', () => {
      const result = createCrmSegmentSchema.safeParse({
        subject: 'CREDIT_APPLICANT',
        name: 'Mora temprana',
        definition: {
          match: 'ALL',
          rules: [{ attribute: 'territory', operator: 'EQUALS', value: 'Oriente' }],
        },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((issue) => issue.message).join(' | ')).toContain(
          'solicitantes de crédito',
        );
      }
    });

    it('acepta el mismo criterio cuando se le aplica al sujeto que sí lo tiene', () => {
      const result = createCrmSegmentSchema.safeParse({
        subject: 'CREDIT_APPLICANT',
        name: 'Mora temprana',
        definition: {
          match: 'ALL',
          rules: [{ attribute: 'maxDaysPastDue', operator: 'BETWEEN', value: [30, 90] }],
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('el sujeto no se puede cambiar después', () => {
    it('la edición ignora el sujeto aunque venga en el cuerpo', () => {
      // Cambiarlo dejaría reglas del sujeto anterior mirando atributos que el nuevo no tiene: el
      // segmento seguiría existiendo y pasaría a contar cero sin que nada lo explicara.
      const result = updateCrmSegmentSchema.safeParse({ name: 'Otro nombre', subject: 'PARTNER' });
      expect(result.success).toBe(true);
      if (result.success) expect('subject' in result.data).toBe(false);
    });

    it('una edición vacía se rechaza en vez de guardar nada', () => {
      expect(updateCrmSegmentSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('a quién alcanza un segmento', () => {
    function evaluar(
      definition: SegmentDefinition<CrmSegmentAttribute>,
      facts: Record<string, string | number | string[]>,
    ): boolean {
      return matchesDefinition(definition, facts as never);
    }

    it('un tag es «lleva ese tag», no «lleva sólo ese tag»', () => {
      // La cuenta lleva dos tags: exigir que la lista entera sea «mayorista» dejaría fuera a la
      // mayoría de las cuentas, que llevan más de uno.
      const definition: SegmentDefinition<CrmSegmentAttribute> = {
        match: 'ALL',
        rules: [{ attribute: 'tag', operator: 'EQUALS', value: 'mayorista' }],
      };
      expect(evaluar(definition, { tag: ['mayorista', 'clave'] })).toBe(true);
      expect(evaluar(definition, { tag: ['minorista'] })).toBe(false);
      expect(evaluar(definition, { tag: [] })).toBe(false);
    });

    it('un hecho que no se sabe NO cumple la regla', () => {
      // Fallando cerrado el segmento se queda corto y alguien pregunta; al revés, un partner sin
      // rubro cargado entraría en el segmento de farmacias y nadie lo notaría.
      const definition: SegmentDefinition<CrmSegmentAttribute> = {
        match: 'ALL',
        rules: [{ attribute: 'category', operator: 'EQUALS', value: 'FARMACIA' }],
      };
      expect(evaluar(definition, {})).toBe(false);
      expect(evaluar(definition, { category: 'farmacia ' })).toBe(true);
    });

    it('cero es un hecho, no una ausencia', () => {
      // Un cliente con cero cuotas en mora tiene que poder entrar en «al día»: si el cero se
      // tratara como «no se sabe», el segmento de los buenos pagadores contaría cero.
      const alDia: SegmentDefinition<CrmSegmentAttribute> = {
        match: 'ALL',
        rules: [{ attribute: 'overdueInstallmentCount', operator: 'EQUALS', value: 0 }],
      };
      expect(evaluar(alDia, { overdueInstallmentCount: 0 })).toBe(true);
      expect(evaluar(alDia, { overdueInstallmentCount: 2 })).toBe(false);
      expect(evaluar(alDia, {})).toBe(false);
    });

    it('ALL exige todas las reglas y ANY basta con una', () => {
      const rules = [
        { attribute: 'city' as const, operator: 'EQUALS' as const, value: 'Santa Cruz' },
        { attribute: 'branchCount' as const, operator: 'BETWEEN' as const, value: [2, 10] },
      ];
      const facts = { city: 'Santa Cruz', branchCount: 25 };
      expect(evaluar({ match: 'ALL', rules }, facts)).toBe(false);
      expect(evaluar({ match: 'ANY', rules }, facts)).toBe(true);
    });
  });

  describe('el catálogo se audita leyendo', () => {
    it('resume la definición en una línea', () => {
      expect(
        describeDefinition({
          match: 'ALL',
          rules: [
            { attribute: 'category', operator: 'IN', value: ['FARMACIA', 'MERCADO'] },
            { attribute: 'city', operator: 'EQUALS', value: 'Santa Cruz' },
          ],
        }),
      ).toBe('category IN (FARMACIA, MERCADO) y city EQUALS Santa Cruz');
    });

    it('dice explícitamente cuando un segmento no restringe nada', () => {
      expect(describeDefinition({ match: 'ALL', rules: [] })).toContain('alcanza a todos');
    });
  });
});
