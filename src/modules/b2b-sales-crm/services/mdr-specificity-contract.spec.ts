import { MDR_DIMENSION_WEIGHT, mdrRuleSpecificity } from '../domain/mdr-rule-specificity';
import type { MDRRuleModel } from '../models/b2b-sales-crm.models';
import { B2BContractsService } from './b2b-contracts.service';
import { B2BSalesCrmUseCaseBase } from './b2b-sales-crm-use-case.base';

/**
 * Cobro y pantalla tienen que ELEGIR IGUAL la regla de comisión (T-9).
 *
 * Eran dos criterios: la pantalla (`listMdrRules`) ponderaba sucursal 4, categoría 2, riesgo 1, y el
 * cobro (`calculateMdr` → `pickBestMdrRule`) contaba dimensiones con igual peso. La regla que la
 * pantalla enseñaba como ganadora podía perder al cobrar, y dos reglas de una sola dimensión
 * EMPATABAN al cobrar y ganaba la que la base devolviera primero.
 *
 * Esta prueba es COMPARTIDA: una sola tabla de casos, ejecutada contra los dos lados y contra
 * todas las permutaciones del orden en que la base entrega las reglas. Si alguien vuelve a darle a
 * uno de los dos lados su propio criterio, un caso de esta tabla se pone rojo.
 */

/** La venta de la que se habla: todas las reglas de la tabla casan con ella. */
const VENTA = { branchId: 'suc-1', productCategory: 'ELECTRO', riskSegment: 'A' } as const;

const SUC = { branchId: VENTA.branchId };
const CAT = { productCategory: VENTA.productCategory };
const RIESGO = { riskSegment: VENTA.riskSegment };

interface ReglaDeCaso {
  id: string;
  branchId?: string;
  productCategory?: string;
  riskSegment?: string;
}

interface Caso {
  nombre: string;
  /** Las reglas, de la que GANA a la que pierde. */
  orden: ReglaDeCaso[];
}

const CASOS: Caso[] = [
  {
    // El corazón de T-9: por conteo (1 contra 2) ganaba categoría + riesgo; ponderado (4 contra 3),
    // la sucursal. La pantalla ya decía lo segundo.
    nombre: 'una regla de SÓLO sucursal gana a una de categoría + riesgo',
    orden: [
      { id: 'sucursal', ...SUC },
      { id: 'categoria+riesgo', ...CAT, ...RIESGO },
    ],
  },
  {
    // Por conteo, las tres empatan a 1 y gana la que la base devuelva primero.
    nombre: 'con una dimensión cada una, sucursal > categoría > riesgo, sin empate',
    orden: [
      { id: 'sucursal', ...SUC },
      { id: 'categoria', ...CAT },
      { id: 'riesgo', ...RIESGO },
    ],
  },
  {
    nombre: 'categoría sola gana a riesgo solo',
    orden: [
      { id: 'categoria', ...CAT },
      { id: 'riesgo', ...RIESGO },
    ],
  },
  {
    // Por conteo, empatan a 2.
    nombre: 'sucursal + categoría gana a sucursal + riesgo',
    orden: [
      { id: 'sucursal+categoria', ...SUC, ...CAT },
      { id: 'sucursal+riesgo', ...SUC, ...RIESGO },
    ],
  },
  {
    nombre: 'las tres dimensiones ganan a sucursal + categoría',
    orden: [
      { id: 'las-tres', ...SUC, ...CAT, ...RIESGO },
      { id: 'sucursal+categoria', ...SUC, ...CAT },
    ],
  },
  {
    nombre: 'la regla general (sin dimensiones) pierde contra cualquier específica',
    orden: [{ id: 'riesgo', ...RIESGO }, { id: 'general' }],
  },
  {
    nombre:
      'orden total de los tres pesos: sucursal > categoría + riesgo > categoría > riesgo > general',
    orden: [
      { id: 'sucursal', ...SUC },
      { id: 'categoria+riesgo', ...CAT, ...RIESGO },
      { id: 'categoria', ...CAT },
      { id: 'riesgo', ...RIESGO },
      { id: 'general' },
    ],
  },
];

/** Todas las formas de ordenar una lista: la base no promete ningún orden al entregar las reglas. */
const permutaciones = <T>(lista: T[]): T[][] =>
  lista.length <= 1
    ? [lista]
    : lista.flatMap((elemento, i) =>
        permutaciones([...lista.slice(0, i), ...lista.slice(i + 1)]).map((resto) => [
          elemento,
          ...resto,
        ]),
      );

/** Una fila `mdr_rules`; cada regla lleva una tarifa distinta para reconocer cuál se cobró. */
const comoFila = (regla: ReglaDeCaso, indice: number) => ({
  id: regla.id,
  contractVersionId: 'version-1',
  branchId: regla.branchId ?? null,
  productCategory: regla.productCategory ?? null,
  riskSegment: regla.riskSegment ?? null,
  ratePercent: String(10 + indice),
  minFeeAmount: null,
  maxFeeAmount: null,
  isActive: true,
});

// --- Lado 1: el COBRO ------------------------------------------------------------------------

class Cobro extends B2BSalesCrmUseCaseBase {
  constructor() {
    super({} as never, {} as never);
  }

  /** La tarifa que `calculateMdr` cobra a `VENTA` con estas reglas (P-07: en texto, no en número). */
  tarifaCobrada(reglas: ReturnType<typeof comoFila>[]): string {
    const cobro = this.calculateMdr(
      1000,
      { mdrRules: reglas as unknown as MDRRuleModel[], terms: [] } as never,
      VENTA.branchId,
      VENTA.productCategory,
      VENTA.riskSegment,
    );
    expect(cobro.source).toBe('mdr_rules');
    return cobro.ratePercent;
  }
}

/** El id de la regla que el cobro elige entre `reglas`, recuperado por su tarifa. */
const ganadoraAlCobrar = (reglas: ReglaDeCaso[]): string => {
  const filas = reglas.map(comoFila);
  const tarifa = new Cobro().tarifaCobrada(filas);
  const elegida = filas.find((fila) => Number(fila.ratePercent) === Number(tarifa));
  return elegida?.id ?? 'ninguna';
};

// --- Lado 2: la PANTALLA ---------------------------------------------------------------------

/** Los ids en el orden en que `listMdrRules` los enseña. */
const ordenEnPantalla = async (reglas: ReglaDeCaso[]): Promise<string[]> => {
  const repository = { mdrRules: { findAll: jest.fn(async () => reglas.map(comoFila)) } };
  const service = new B2BContractsService(repository as never, { infoContext: jest.fn() } as never);
  const listado = await service.listMdrRules('version-1');
  return listado.map((fila) => String(fila.id));
};

describe('Cobro y pantalla eligen la misma regla de comisión (T-9)', () => {
  describe.each(CASOS.map((caso) => [caso.nombre, caso.orden] as const))('%s', (_nombre, orden) => {
    const ids = orden.map((regla) => regla.id);
    const entregas = permutaciones([...orden]);

    it(`COBRO: cobra la ganadora (${ids[0]}) sea cual sea el orden en que la base entrega las reglas`, () => {
      // Se acumulan los desacuerdos en vez de fallar en el primero: si el criterio se rompe, el
      // mensaje enseña TODOS los órdenes de entrega que dan un cobro distinto.
      const desacuerdos = entregas
        .map((entrega) => ({
          entrega: entrega.map((r) => r.id).join(' · '),
          cobrada: ganadoraAlCobrar(entrega),
        }))
        .filter((prueba) => prueba.cobrada !== ids[0]);

      expect(desacuerdos).toEqual([]);
    });

    it('PANTALLA: lista de la más a la menos específica sea cual sea el orden de entrega', async () => {
      const desacuerdos: { entrega: string; enPantalla: string[] }[] = [];
      for (const entrega of entregas) {
        const enPantalla = await ordenEnPantalla(entrega);
        if (enPantalla.join() !== ids.join()) {
          desacuerdos.push({ entrega: entrega.map((r) => r.id).join(' · '), enPantalla });
        }
      }

      expect(desacuerdos).toEqual([]);
    });

    it('COBRO: quitada la ganadora, cobra la siguiente en el orden que enseña la pantalla', () => {
      // La pantalla dice un ORDEN completo, no sólo una ganadora: el cobro tiene que ser fiel a él
      // en cada escalón.
      const cobradaPorEscalon = orden.map((_regla, escalon) =>
        ganadoraAlCobrar(orden.slice(escalon).reverse()),
      );

      expect(cobradaPorEscalon).toEqual(ids);
    });
  });

  it('una regla que NO casa con la venta no gana aunque sea la más específica (sólo el cobro filtra)', () => {
    const otraSucursal = { id: 'otra-sucursal', branchId: 'suc-2', ...CAT, ...RIESGO };
    const general = { id: 'general' };

    expect(ganadoraAlCobrar([otraSucursal, general])).toBe('general');
  });
});

describe('MDR_DIMENSION_WEIGHT · la constante que ambos lados usan', () => {
  it('cada dimensión pesa MÁS que todas las de menor rango juntas: el orden es total, sin empates', () => {
    const { branch, productCategory, riskSegment } = MDR_DIMENSION_WEIGHT;

    expect(branch).toBeGreaterThan(productCategory + riskSegment);
    expect(productCategory).toBeGreaterThan(riskSegment);
    expect(riskSegment).toBeGreaterThan(0);
  });

  it('las ocho combinaciones de dimensiones dan ocho pesos distintos', () => {
    const pesos = new Set<number>();
    for (const branchId of [null, 'b']) {
      for (const productCategory of [null, 'c']) {
        for (const riskSegment of [null, 'r']) {
          pesos.add(mdrRuleSpecificity({ branchId, productCategory, riskSegment }));
        }
      }
    }

    expect(pesos.size).toBe(8);
  });

  it('el peso que la pantalla imprime en `specificity` es el de la constante', async () => {
    const repository = {
      mdrRules: {
        findAll: jest.fn(async () => [
          comoFila({ id: 'a', ...SUC, ...CAT, ...RIESGO }, 0),
          comoFila({ id: 'b' }, 1),
        ]),
      },
    };
    const service = new B2BContractsService(
      repository as never,
      {
        infoContext: jest.fn(),
      } as never,
    );

    const listado = await service.listMdrRules('version-1');

    expect(listado.map((fila) => fila.specificity)).toEqual([
      MDR_DIMENSION_WEIGHT.branch +
        MDR_DIMENSION_WEIGHT.productCategory +
        MDR_DIMENSION_WEIGHT.riskSegment,
      0,
    ]);
  });
});
