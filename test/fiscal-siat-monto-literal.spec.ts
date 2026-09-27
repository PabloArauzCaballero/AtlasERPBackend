import { enteroEnLetras, montoLiteral } from '../src/modules/fiscal/siat/domain/monto-literal';

describe('monto en letras de la factura', () => {
  it.each([
    [0, 'cero'],
    [1, 'uno'],
    [21, 'veintiuno'],
    [100, 'cien'],
    [101, 'ciento uno'],
    [170, 'ciento setenta'],
    [1000, 'mil'],
    [1001, 'mil uno'],
    [21000, 'veintiún mil'],
    [31000, 'treinta y un mil'],
    [1_000_000, 'un millón'],
    [2_500_750, 'dos millones quinientos mil setecientos cincuenta'],
  ])('%i → %s', (n, texto) => {
    expect(enteroEnLetras(n)).toBe(texto);
  });

  it('formato de la factura, con céntimos en fracción', () => {
    expect(montoLiteral('170.50')).toBe('Son: Ciento setenta 50/100 Bolivianos');
    expect(montoLiteral('99.00')).toBe('Son: Noventa y nueve 00/100 Bolivianos');
  });

  it('fuera de rango lanza en vez de escribir otra cosa', () => {
    expect(() => enteroEnLetras(-1)).toThrow(RangeError);
    expect(() => enteroEnLetras(1e12)).toThrow(RangeError);
  });
});
