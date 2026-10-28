import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  buildInvoiceJournalLines,
  grossFromNetAndTax,
  type ResolvedArInvoice,
} from '../src/modules/accounting/billing/domain/ar-invoice';
import { DoubleEntryValidator } from '../src/modules/accounting/posting/validators/double-entry.validator';
import { ReceiptsService } from '../src/modules/accounting/receipts/services/receipts.service';

/**
 * Auditoría de seguridad 2026-10-28 (COBIT 5 DSS06 / regla 91.1.1): el bruto de la factura AR se
 * calculaba como `Number(neto) + Number(impuesto)` y los recibos comparaban asignaciones con
 * tolerancia de 0.009 en coma flotante. `0.01 + 0.05 = 0.060000000000000005` no es un importe de
 * centavos, así que el validador de partida doble rechazaba la factura (INVALID_JOURNAL_LINE) en
 * cerca de uno de cada cuatro pares válidos.
 */
const validator = new DoubleEntryValidator({ warn: jest.fn(), debug: jest.fn() } as never);

function factura(netAmount: number, taxAmount: number): ResolvedArInvoice {
  return {
    legalEntityId: 'le',
    customerBpId: 'bp',
    arAccountId: 'ar',
    revenueAccountId: 'rev',
    taxLiabilityAccountId: 'tax',
    taxCodeId: 'iva',
    currencyCode: 'BOB',
    netAmount,
    taxAmount,
    description: 'Servicio',
  } as unknown as ResolvedArInvoice;
}

describe('bruto de la factura AR', () => {
  describe('correcto', () => {
    it.each([
      [100, 13, 113],
      [100.1, 13.01, 113.11],
      [0.01, 0.05, 0.06],
      [0.1, 0.2, 0.3],
      [87.61, 11.39, 99],
    ])('neto %p + impuesto %p = %p exacto', (neto, impuesto, esperado) => {
      expect(grossFromNetAndTax(neto, impuesto)).toBe(esperado);
    });
  });

  describe('límite', () => {
    it('sin impuesto, el bruto es el neto', () => {
      expect(grossFromNetAndTax(250.5, 0)).toBe(250.5);
    });

    it('acepta importes como cadena numeric de Postgres', () => {
      expect(grossFromNetAndTax('100.10', '13.01')).toBe(113.11);
    });

    it('el asiento que sale de cada par con centavos cuadra en el validador de partida doble', () => {
      let probados = 0;
      for (let neto = 1; neto < 400; neto += 1) {
        for (let impuesto = 1; impuesto < 100; impuesto += 1) {
          const n = neto / 100;
          const i = impuesto / 100;
          const lines = buildInvoiceJournalLines(
            factura(n, i),
            grossFromNetAndTax(n, i),
            'f',
            'FAC-1',
          );
          expect(() => validator.validate(lines)).not.toThrow();
          probados += 1;
        }
      }
      expect(probados).toBe(399 * 99);
    });
  });

  describe('inválido', () => {
    it('documenta el defecto de la suma en coma flotante que se corrigió', () => {
      const ingenuo = 0.01 + 0.05;
      expect(ingenuo).not.toBe(0.06);
      const lines = buildInvoiceJournalLines(factura(0.01, 0.05), ingenuo, 'f', 'FAC-1');
      expect(() => validator.validate(lines)).toThrow(BadRequestException);
    });

    it('un importe que no es un número se rechaza, no se redondea en silencio', () => {
      expect(() => grossFromNetAndTax(Number.NaN, 1)).toThrow();
    });
  });
});

describe('recibo AR: asignaciones en centavos exactos', () => {
  function servicio(opts: { grossAmount: string; yaAsignado: number | null }) {
    const svc = Object.create(ReceiptsService.prototype) as ReceiptsService;
    Object.assign(svc, {
      logger: { debug: jest.fn() },
      businessPartnerRoleValidationService: {
        assertHasAnyActiveRole: jest.fn(async () => undefined),
      },
      arInvoiceModel: {
        findByPk: jest.fn(async () => ({
          legalEntityId: 'le',
          customerBpId: 'bp',
          status: 'ISSUED',
          grossAmount: opts.grossAmount,
        })),
      },
      receiptAllocationModel: { sum: jest.fn(async () => opts.yaAsignado) },
    });
    const registrar = (amount: number, allocations: number[]) =>
      (
        svc as unknown as {
          assertReceiptCanBeRecorded(input: unknown, tx: unknown): Promise<void>;
        }
      ).assertReceiptCanBeRecorded(
        {
          legalEntityId: 'le',
          payerBpId: 'bp',
          amount,
          allocations: allocations.map((allocatedAmount) => ({
            arInvoiceId: 'f-1',
            allocatedAmount,
          })),
        },
        { LOCK: { UPDATE: 'UPDATE' } },
      );
    return registrar;
  }

  describe('correcto', () => {
    it('0.10 + 0.20 suman exactamente un recibo de 0.30', async () => {
      await expect(
        servicio({ grossAmount: '0.30', yaAsignado: null })(0.3, [0.1, 0.2]),
      ).resolves.toBeUndefined();
    });

    it('asigna justo el saldo abierto', async () => {
      await expect(
        servicio({ grossAmount: '113.11', yaAsignado: 13.11 })(100, [100]),
      ).resolves.toBeUndefined();
    });
  });

  describe('límite', () => {
    it('un centavo de más en las asignaciones es RECEIPT_ALLOCATION_TOTAL_MISMATCH', async () => {
      await expect(
        servicio({ grossAmount: '1.00', yaAsignado: null })(0.3, [0.1, 0.21]),
      ).rejects.toMatchObject({
        response: { code: 'RECEIPT_ALLOCATION_TOTAL_MISMATCH' },
      });
    });

    it('un centavo por encima del saldo abierto es AR_INVOICE_ALLOCATION_EXCEEDS_OPEN_BALANCE', async () => {
      const promesa = servicio({ grossAmount: '113.11', yaAsignado: 13.11 })(100.01, [100.01]);
      await expect(promesa).rejects.toBeInstanceOf(ConflictException);
      await expect(promesa).rejects.toMatchObject({
        response: {
          code: 'AR_INVOICE_ALLOCATION_EXCEEDS_OPEN_BALANCE',
          details: { allocatedAmount: 100.01, outstandingAmount: 100 },
        },
      });
    });
  });

  describe('inválido', () => {
    it('la suma de la base con cola de coma flotante (0.30000000000000004) deja saldo cero, no un resto', async () => {
      // `sum()` de Sequelize devuelve un number: 0.1 + 0.2 llega como 0.30000000000000004.
      await expect(
        servicio({ grossAmount: '0.30', yaAsignado: 0.1 + 0.2 })(0.01, [0.01]),
      ).rejects.toMatchObject({
        response: { code: 'AR_INVOICE_ALLOCATION_EXCEEDS_OPEN_BALANCE' },
      });
    });
  });
});
