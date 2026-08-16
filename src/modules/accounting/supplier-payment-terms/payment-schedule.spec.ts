import { calcularFechasDePago, revisarCondicion, type CondicionDePago } from './payment-schedule';
import { buildPaymentTermsCatalog } from './payment-terms.catalog';

/**
 * Cómo se le paga a un proveedor.
 *
 * Esto sustituye a una nota escrita a mano. La diferencia no es cosmética: con
 * la nota, la fecha de vencimiento la calculaba una persona interpretando una
 * frase, nadie podía responder «¿cuánto vence esta semana?» sin abrir las
 * facturas una a una, y las discrepancias —que casi siempre son sobre la BASE de
 * cómputo, no sobre el plazo— sólo salían cuando el proveedor reclamaba.
 */

const CREDITO_30: CondicionDePago = {
  modalidad: 'CREDITO',
  baseDeComputo: 'FECHA_FACTURA',
  plazoDias: 30,
  medioDePago: 'CHEQUE',
};

describe('la base de cómputo cambia la fecha, y por eso se declara', () => {
  it('a 30 días desde la factura', () => {
    const fechas = calcularFechasDePago(CREDITO_30, {
      fechaFactura: '2026-08-16',
      importe: 1000,
    });
    expect(fechas.base).toBe('2026-08-16');
    expect(fechas.vencimiento).toBe('2026-09-15');
  });

  it('a 30 días desde la RECEPCIÓN son otras semanas', () => {
    // Ésta es la discrepancia que más disputas de pago produce: mismo plazo,
    // distinta base, tres semanas de diferencia.
    const fechas = calcularFechasDePago(
      { ...CREDITO_30, baseDeComputo: 'FECHA_RECEPCION' },
      { fechaFactura: '2026-08-16', fechaRecepcion: '2026-09-05', importe: 1000 },
    );
    expect(fechas.base).toBe('2026-09-05');
    expect(fechas.vencimiento).toBe('2026-10-05');
  });

  it('sin recepción registrada cuenta desde la factura, que es lo conservador', () => {
    /*
     * Contar desde una recepción que no consta sería inventar una fecha.
     * Contando desde la factura el vencimiento sale igual o ANTES, así que como
     * mucho se paga antes de tiempo; nunca tarde.
     */
    const fechas = calcularFechasDePago(
      { ...CREDITO_30, baseDeComputo: 'FECHA_RECEPCION' },
      { fechaFactura: '2026-08-16', fechaRecepcion: null, importe: 1000 },
    );
    expect(fechas.base).toBe('2026-08-16');
  });

  it('«fin de mes» cuenta desde el último día del mes de la factura', () => {
    const fechas = calcularFechasDePago(
      { ...CREDITO_30, baseDeComputo: 'FIN_DE_MES' },
      { fechaFactura: '2026-08-16', importe: 1000 },
    );
    expect(fechas.base).toBe('2026-08-31');
    expect(fechas.vencimiento).toBe('2026-09-30');
  });

  it('cruza el cambio de año sin desviarse', () => {
    const fechas = calcularFechasDePago(CREDITO_30, {
      fechaFactura: '2026-12-20',
      importe: 100,
    });
    expect(fechas.vencimiento).toBe('2027-01-19');
  });
});

describe('la modalidad puede fijar sus propios días', () => {
  it('contado vence el mismo día, aunque lleve un plazo escrito', () => {
    // El plazo se ignora a propósito: «contado a 30 días» no significa nada, y
    // resolverlo en silencio a favor del plazo pagaría un mes tarde.
    const fechas = calcularFechasDePago(
      { ...CREDITO_30, modalidad: 'CONTADO', plazoDias: 30 },
      { fechaFactura: '2026-08-16', importe: 500 },
    );
    expect(fechas.vencimiento).toBe('2026-08-16');
  });
});

describe('el anticipo reparte el importe sin descuadrar la factura', () => {
  it('separa lo adelantado de lo diferido', () => {
    const fechas = calcularFechasDePago(
      {
        modalidad: 'ANTICIPO',
        baseDeComputo: 'FECHA_FACTURA',
        plazoDias: 0,
        medioDePago: 'CHEQUE',
        porcentajeAnticipo: 40,
      },
      { fechaFactura: '2026-08-16', importe: 1000 },
    );
    expect(fechas.montoAnticipo).toBe(400);
    expect(fechas.montoDiferido).toBe(600);
  });

  it('las dos partes siempre suman el total, incluso con céntimos', () => {
    /*
     * El diferido sale por RESTA y no por su propio porcentaje. Calculando los
     * dos por separado, 33 % de 100,01 deja la suma un céntimo por debajo del
     * total y la factura queda descuadrada — un descuadre que aparece en el
     * cierre contable, no aquí.
     */
    const fechas = calcularFechasDePago(
      {
        modalidad: 'ANTICIPO',
        baseDeComputo: 'FECHA_FACTURA',
        plazoDias: 0,
        medioDePago: 'CHEQUE',
        porcentajeAnticipo: 33,
      },
      { fechaFactura: '2026-08-16', importe: 100.01 },
    );
    expect(fechas.montoAnticipo + fechas.montoDiferido).toBeCloseTo(100.01, 2);
  });

  it('sin modalidad de anticipo no adelanta nada', () => {
    const fechas = calcularFechasDePago(
      { ...CREDITO_30, porcentajeAnticipo: 40 },
      { fechaFactura: '2026-08-16', importe: 1000 },
    );
    expect(fechas.montoAnticipo).toBe(0);
  });
});

describe('la condición se revisa al GUARDARLA, no al pagar', () => {
  it('una condición completa no tiene problemas', () => {
    expect(revisarCondicion(CREDITO_30)).toEqual([]);
  });

  it('una transferencia sin cuenta bancaria no se puede emitir', () => {
    // Descubrirlo en la corrida de pagos del viernes son veinte facturas
    // paradas; descubrirlo al dar de alta al proveedor es un campo más.
    const problemas = revisarCondicion({ ...CREDITO_30, medioDePago: 'TRANSFERENCIA' });
    expect(problemas.map((p) => p.code)).toContain('CUENTA_REQUERIDA');
  });

  it('una transferencia CON cuenta sí se puede', () => {
    expect(
      revisarCondicion({
        ...CREDITO_30,
        medioDePago: 'TRANSFERENCIA',
        cuentaBancariaId: 'bp-acc-1',
      }),
    ).toEqual([]);
  });

  it('crédito sin plazo se rechaza en vez de asumir cero', () => {
    // Asumir cero convertiría un crédito en un contado sin avisar a nadie.
    const problemas = revisarCondicion({ ...CREDITO_30, plazoDias: 0 });
    expect(problemas.map((p) => p.code)).toContain('PLAZO_REQUERIDO');
  });

  it('un anticipo declarado sin modalidad de anticipo se señala', () => {
    // Ni se aplica a escondidas ni se descarta en silencio: un anticipo que
    // nadie declaró es dinero que sale antes de tiempo.
    const problemas = revisarCondicion({ ...CREDITO_30, porcentajeAnticipo: 20 });
    expect(problemas.map((p) => p.code)).toContain('ANTICIPO_SIN_MODALIDAD');
  });

  it('la modalidad anticipo exige un porcentaje', () => {
    const problemas = revisarCondicion({
      ...CREDITO_30,
      modalidad: 'ANTICIPO',
      porcentajeAnticipo: 0,
    });
    expect(problemas.map((p) => p.code)).toContain('ANTICIPO_SIN_PORCENTAJE');
  });

  it('un porcentaje imposible se rechaza', () => {
    const problemas = revisarCondicion({
      ...CREDITO_30,
      modalidad: 'ANTICIPO',
      porcentajeAnticipo: 140,
    });
    expect(problemas.map((p) => p.code)).toContain('ANTICIPO_FUERA_DE_RANGO');
  });
});

describe('el catálogo se sirve entero, para que nadie copie listas', () => {
  it('publica las cinco dimensiones con sus etiquetas', () => {
    const catalogo = buildPaymentTermsCatalog();
    expect(catalogo.modalidades.map((m) => m.code)).toContain('HITOS');
    expect(catalogo.mediosDePago.map((m) => m.code)).toContain('QR');
    expect(catalogo.frecuencias.map((f) => f.code)).toContain('TRIMESTRAL');
    expect(catalogo.estados.map((e) => e.code)).toContain('SUSPENDIDA');
    expect(catalogo.basesDeComputo.map((b) => b.code)).toContain('FIN_DE_MES');
    // Cada término se puede pintar sin inventarle un nombre.
    for (const modalidad of catalogo.modalidades) expect(modalidad.label).toBeTruthy();
  });
});
