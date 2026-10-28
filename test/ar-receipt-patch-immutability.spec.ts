import { ConflictException } from '@nestjs/common';
import { ArInvoiceMaintenanceService } from '../src/modules/accounting/billing/services/ar-invoice-maintenance.service';
import { ReceiptsService } from '../src/modules/accounting/receipts/services/receipts.service';

/**
 * Auditoría de seguridad 2026-10-28 (COBIT 5 DSS06 / BAI06): el PATCH de la factura AR y del recibo
 * aceptaba cualquier `status` del dominio y cualquier fecha sobre un documento ya contabilizado.
 * Con eso se marcaba `PAID` una factura que nadie cobró, o `VOID` un recibo con asiento y
 * asignaciones vivos, y el mayor y el subauxiliar dejaban de contar lo mismo.
 *
 * Los modelos son DOBLES declarados: se prueba la regla, no la persistencia (esa necesita
 * PostgreSQL y va en `*.integration.spec.ts`).
 */
const user = { sub: '11111111-1111-4111-8111-111111111111', role: 'admin', roles: ['admin'] };

function facturas(fila: Record<string, unknown>) {
  const svc = Object.create(ArInvoiceMaintenanceService.prototype) as ArInvoiceMaintenanceService;
  const update = jest.fn(async () => undefined);
  Object.assign(svc, {
    legalEntityAccessService: { assertCanAccessLegalEntity: jest.fn() },
    arInvoiceModel: {
      findByPk: jest.fn(async () => ({ id: 'f-1', legalEntityId: 'le', ...fila, update })),
    },
  });
  return { svc, update };
}

function recibos(fila: Record<string, unknown>) {
  const svc = Object.create(ReceiptsService.prototype) as ReceiptsService;
  const update = jest.fn(async () => undefined);
  Object.assign(svc, {
    legalEntityAccessService: { assertCanAccessLegalEntity: jest.fn() },
    receiptModel: {
      findByPk: jest.fn(async () => ({ id: 'r-1', legalEntityId: 'le', ...fila, update })),
    },
  });
  return { svc, update };
}

const emitida = {
  status: 'ISSUED',
  accountingDocumentId: 'doc-1',
  invoiceDate: '2026-10-01',
  dueDate: '2026-10-31',
};
const registrado = {
  status: 'RECORDED',
  accountingDocumentId: 'doc-2',
  receiptDate: new Date('2026-10-02T00:00:00Z'),
  bankAccountId: 'banco-1',
};

describe('PATCH de factura AR', () => {
  describe('correcto', () => {
    it('corrige el vencimiento de una factura emitida', async () => {
      const { svc, update } = facturas(emitida);
      await svc.updateInvoice('f-1', { dueDate: '2026-11-15' }, user as never);
      expect(update).toHaveBeenCalledWith({ dueDate: '2026-11-15' });
    });

    it('repetir el estado o la fecha actuales es un no-op aceptado', async () => {
      const { svc, update } = facturas(emitida);
      await svc.updateInvoice(
        'f-1',
        { status: 'ISSUED', invoiceDate: '2026-10-01', dueDate: '2026-10-31' },
        user as never,
      );
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('un borrador se puede descartar (DRAFT → VOID)', async () => {
      const { svc, update } = facturas({
        status: 'DRAFT',
        accountingDocumentId: null,
        invoiceDate: '2026-10-01',
      });
      await svc.updateInvoice('f-1', { status: 'VOID' }, user as never);
      expect(update).toHaveBeenCalledWith({ status: 'VOID' });
    });
  });

  describe('límite', () => {
    it.each(['PAID', 'PARTIALLY_PAID', 'CREDITED', 'VOID', 'DRAFT'])(
      'una factura emitida no pasa a %s por PATCH',
      async (destino) => {
        const { svc, update } = facturas(emitida);
        const promesa = svc.updateInvoice('f-1', { status: destino }, user as never);
        await expect(promesa).rejects.toBeInstanceOf(ConflictException);
        await expect(promesa).rejects.toMatchObject({
          response: {
            code: 'AR_INVOICE_STATUS_MANAGED_BY_WORKFLOW',
            details: { from: 'ISSUED', to: destino },
          },
        });
        expect(update).not.toHaveBeenCalled();
      },
    );

    it('un borrador tampoco salta a PAID', async () => {
      const { svc, update } = facturas({
        status: 'DRAFT',
        accountingDocumentId: null,
        invoiceDate: '2026-10-01',
      });
      await expect(
        svc.updateInvoice('f-1', { status: 'PAID' }, user as never),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('inválido', () => {
    it('la fecha de una factura emitida no se mueve (fechó el asiento y el documento fiscal)', async () => {
      const { svc, update } = facturas(emitida);
      const promesa = svc.updateInvoice('f-1', { invoiceDate: '2026-09-01' }, user as never);
      await expect(promesa).rejects.toMatchObject({
        response: { code: 'AR_INVOICE_POSTED_FIELD_LOCKED', details: { field: 'invoiceDate' } },
      });
      expect(update).not.toHaveBeenCalled();
    });

    it('si el estado es válido pero la fecha no, no se aplica NADA (todo o nada)', async () => {
      const { svc, update } = facturas(emitida);
      await expect(
        svc.updateInvoice(
          'f-1',
          { dueDate: '2026-12-01', invoiceDate: '2026-09-01' },
          user as never,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(update).not.toHaveBeenCalled();
    });
  });
});

describe('PATCH de recibo', () => {
  describe('correcto', () => {
    it('repetir los valores actuales es un no-op aceptado', async () => {
      const { svc, update } = recibos(registrado);
      await svc.update(
        'r-1',
        { status: 'RECORDED', receiptDate: '2026-10-02', bankAccountId: 'banco-1' },
        user as never,
      );
      expect(update).toHaveBeenCalledTimes(1);
    });
  });

  describe('límite', () => {
    it.each(['VOID', 'POSTED', 'DRAFT'])(
      'un recibo registrado no pasa a %s por PATCH',
      async (destino) => {
        const { svc, update } = recibos(registrado);
        const promesa = svc.update('r-1', { status: destino }, user as never);
        await expect(promesa).rejects.toMatchObject({
          response: {
            code: 'RECEIPT_STATUS_MANAGED_BY_WORKFLOW',
            details: { from: 'RECORDED', to: destino },
          },
        });
        expect(update).not.toHaveBeenCalled();
      },
    );
  });

  describe('inválido', () => {
    it('la fecha del recibo contabilizado no se mueve', async () => {
      const { svc, update } = recibos(registrado);
      await expect(
        svc.update('r-1', { receiptDate: '2026-01-01' }, user as never),
      ).rejects.toMatchObject({
        response: { code: 'RECEIPT_POSTED_FIELD_LOCKED', details: { field: 'receiptDate' } },
      });
      expect(update).not.toHaveBeenCalled();
    });

    it('el banco del recibo contabilizado no se cambia por otro', async () => {
      const { svc, update } = recibos(registrado);
      await expect(
        svc.update('r-1', { bankAccountId: 'banco-de-otra-entidad' }, user as never),
      ).rejects.toMatchObject({
        response: { code: 'RECEIPT_POSTED_FIELD_LOCKED', details: { field: 'bankAccountId' } },
      });
      await expect(
        svc.update('r-1', { bankAccountId: null }, user as never),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(update).not.toHaveBeenCalled();
    });
  });
});
