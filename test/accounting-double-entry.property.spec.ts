import { BadRequestException } from '@nestjs/common';
import fc from 'fast-check';
import { DoubleEntryValidator } from '../src/modules/accounting/posting/validators/double-entry.validator';
import { fromMinorUnits } from '../src/common/money/decimal-amount.util';

/**
 * Σ debe = Σ haber como PROPIEDAD, no como tres ejemplos felices.
 *
 * El validador es la única puerta por la que pasan factura, recibo, reversión, anulación y el puente
 * del comercio antes del trigger diferido de la base. Un ejemplo con 100/100 no dice nada de un
 * asiento de 40 líneas con centavos, ni de qué pasa cuando se mueve un solo centavo. Aquí se genera
 * el asiento y se afirma lo que tiene que valer para CUALQUIERA: el cuadrado pasa, el descuadrado por
 * un centavo falla, la reversión de un asiento cuadrado sigue cuadrada, el orden no importa, y la
 * aritmética es exacta en centavos (nada de 0,1 + 0,2).
 */
describe('DoubleEntryValidator · propiedades', () => {
  const validator = new DoubleEntryValidator();
  const centavos = fc.bigInt({ min: 1n, max: 999_999_999_99n }); // hasta 999.999.999,99
  const monto = (c: bigint) => fromMinorUnits(c); // string con dos decimales, como llega de la base

  /** Un asiento cuadrado: n débitos y m créditos que suman lo mismo, repartido al azar. */
  const asientoCuadrado = fc
    .record({
      debitos: fc.array(centavos, { minLength: 1, maxLength: 20 }),
      creditos: fc.array(centavos, { minLength: 1, maxLength: 20 }),
    })
    .map(({ debitos, creditos }) => {
      // Se ajusta el último crédito para que la suma sea igual: si quedara ≤ 0 se compensa con un
      // débito extra, así el generador nunca produce basura y cada caso es un asiento legal.
      const totalD = debitos.reduce((a, b) => a + b, 0n);
      const parciales = creditos.slice(0, -1);
      const parcialC = parciales.reduce((a, b) => a + b, 0n);
      const debitosFinal = [...debitos];
      let ultimo = totalD - parcialC;
      if (ultimo <= 0n) {
        debitosFinal.push(1n - ultimo);
        ultimo = 1n;
      }
      const creditosFinal = [...parciales, ultimo];
      return [
        ...debitosFinal.map((c) => ({ debit: monto(c), credit: '0' })),
        ...creditosFinal.map((c) => ({ debit: '0', credit: monto(c) })),
      ];
    });

  it('todo asiento cuadrado pasa, cualquiera que sea el reparto y el número de líneas', () => {
    fc.assert(
      fc.property(asientoCuadrado, (lineas) => {
        expect(() => validator.validate(lineas)).not.toThrow();
      }),
      { numRuns: 300 },
    );
  });

  it('mover UN centavo en cualquier línea descuadra el asiento y el validador lo rechaza', () => {
    fc.assert(
      fc.property(asientoCuadrado, fc.nat(), fc.boolean(), (lineas, idx, subir) => {
        const i = idx % lineas.length;
        const linea = lineas[i];
        if (!linea) return;
        const lado = linea.debit !== '0' ? 'debit' : 'credit';
        const actual = BigInt(String(linea[lado]).replace('.', ''));
        const nuevo = subir ? actual + 1n : actual - 1n;
        if (nuevo <= 0n) return; // quitar la línea entera es otro caso (y también descuadra)
        const alterado = lineas.map((l, j) => (j === i ? { ...l, [lado]: monto(nuevo) } : l));
        let error: unknown;
        try {
          validator.validate(alterado);
        } catch (e) {
          error = e;
        }
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toMatchObject({
          code: 'UNBALANCED_JOURNAL',
        });
      }),
      { numRuns: 300 },
    );
  });

  it('la reversión (intercambiar débito y crédito) de un asiento cuadrado sigue cuadrada', () => {
    fc.assert(
      fc.property(asientoCuadrado, (lineas) => {
        const revertido = lineas.map((l) => ({ debit: l.credit, credit: l.debit }));
        expect(() => validator.validate(revertido)).not.toThrow();
      }),
      { numRuns: 200 },
    );
  });

  it('el orden de las líneas no cambia el veredicto', () => {
    fc.assert(
      fc.property(asientoCuadrado, fc.nat(), (lineas, semilla) => {
        const barajado = [...lineas].sort(
          (a, b) =>
            (((a.debit + a.credit).length + semilla) % 3) -
            (((b.debit + b.credit).length + semilla) % 3),
        );
        expect(() => validator.validate(barajado)).not.toThrow();
      }),
      { numRuns: 100 },
    );
  });

  it('suma exacta en centavos: importes que en coma flotante no cuadran, aquí sí (0,10 + 0,20 = 0,30)', () => {
    fc.assert(
      fc.property(fc.array(centavos, { minLength: 2, maxLength: 30 }), (partes) => {
        const total = partes.reduce((a, b) => a + b, 0n);
        const lineas = [
          ...partes.map((c) => ({ debit: monto(c), credit: '0' })),
          { debit: '0', credit: monto(total) },
        ];
        expect(() => validator.validate(lineas)).not.toThrow();
        // Y el mismo total calculado con Number puede no coincidir: es la razón de usar bigint.
        const flotante = partes.reduce((a, b) => a + Number(monto(b)), 0);
        expect(Number.isFinite(flotante)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('menos de dos líneas nunca es partida doble: [] y una línea se rechazan', () => {
    for (const lineas of [[], [{ debit: '10.00', credit: '0' }]]) {
      let error: unknown;
      try {
        validator.validate(lineas);
      } catch (e) {
        error = e;
      }
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'JOURNAL_TOO_FEW_LINES',
      });
    }
  });
});
