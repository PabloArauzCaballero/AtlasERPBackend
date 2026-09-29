import { ConflictException } from '@nestjs/common';
import { BillingService } from '../src/modules/accounting/billing/services/billing.service';
import { ReceiptsService } from '../src/modules/accounting/receipts/services/receipts.service';

/**
 * WP14-ERPB (adenda P1): borrar un recibo o una factura AR con rastro contable dejaba el mayor
 * inconsistente (el asiento seguía, las facturas quedaban PAID sin su recibo). Ahora es 409 y sólo
 * se borra lo que no dejó rastro, y el borrado queda en el registro de actividad.
 */
const user = { sub: '11111111-1111-4111-8111-111111111111', role: 'admin', roles: ['admin'] };

function comun() {
  const record = jest.fn(async () => undefined);
  return {
    record,
    deps: {
      legalEntityAccessService: { assertCanAccessLegalEntity: jest.fn() },
      businessActionLogsService: { record },
    },
  };
}

describe('borrar un recibo', () => {
  function servicio(fila: Record<string, unknown>, cobros: number) {
    const svc = Object.create(ReceiptsService.prototype) as ReceiptsService;
    const destroy = jest.fn(async () => undefined);
    const allocationsDestroy = jest.fn(async () => 0);
    const { record, deps } = comun();
    Object.assign(svc, {
      ...deps,
      sequelize: { transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb({})) },
      receiptModel: {
        findByPk: jest.fn(async () => ({ id: 'r-1', legalEntityId: 'le', ...fila, destroy })),
      },
      receiptAllocationModel: { count: jest.fn(async () => cobros), destroy: allocationsDestroy },
    });
    return { svc, destroy, allocationsDestroy, record };
  }

  it('un recibo registrado y contabilizado es 409 y no borra nada', async () => {
    const { svc, destroy, allocationsDestroy, record } = servicio(
      { status: 'RECORDED', accountingDocumentId: 'doc-1', receiptNo: 'REC-1' },
      2,
    );
    const promesa = svc.remove('r-1', user as never);
    await expect(promesa).rejects.toBeInstanceOf(ConflictException);
    await expect(promesa).rejects.toMatchObject({
      response: {
        code: 'RECEIPT_HAS_ACCOUNTING_TRACE',
        details: {
          reasons: ['STATUS_RECORDED', 'HAS_ACCOUNTING_DOCUMENT', 'HAS_RECEIPT_ALLOCATIONS'],
        },
      },
    });
    expect(destroy).not.toHaveBeenCalled();
    expect(allocationsDestroy).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('un borrador sin asiento ni cobros se borra y queda registrado', async () => {
    const { svc, destroy, record } = servicio(
      { status: 'DRAFT', accountingDocumentId: null, receiptNo: 'REC-2' },
      0,
    );
    await expect(svc.remove('r-1', user as never)).resolves.toEqual({ id: 'r-1', deleted: true });
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ actionCode: 'DELETE_DRAFT_RECEIPT', actorUserId: user.sub }),
    );
  });
});

describe('borrar una factura AR', () => {
  function servicio(fila: Record<string, unknown>, rastro: { cobros: string; fiscal: string }) {
    const svc = Object.create(BillingService.prototype) as BillingService;
    const destroy = jest.fn(async () => undefined);
    const linesDestroy = jest.fn(async () => 1);
    const { record, deps } = comun();
    Object.assign(svc, {
      ...deps,
      sequelize: {
        transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb({})),
        query: jest.fn(async () => [rastro]),
      },
      arInvoiceModel: {
        findByPk: jest.fn(async () => ({ id: 'f-1', legalEntityId: 'le', ...fila, destroy })),
      },
      arInvoiceLineModel: { destroy: linesDestroy },
    });
    return { svc, destroy, linesDestroy, record };
  }

  it('una factura pagada, contabilizada y con documento fiscal es 409 y no borra nada', async () => {
    const { svc, destroy, linesDestroy } = servicio(
      { status: 'PAID', accountingDocumentId: 'doc-9', invoiceNo: 'FAC-AR-1' },
      { cobros: '1', fiscal: '1' },
    );
    await expect(svc.deleteInvoice('f-1', user as never)).rejects.toMatchObject({
      response: {
        code: 'AR_INVOICE_HAS_ACCOUNTING_TRACE',
        details: {
          reasons: [
            'STATUS_PAID',
            'HAS_ACCOUNTING_DOCUMENT',
            'HAS_RECEIPT_ALLOCATIONS',
            'HAS_FISCAL_DOCUMENT',
          ],
        },
      },
    });
    expect(destroy).not.toHaveBeenCalled();
    expect(linesDestroy).not.toHaveBeenCalled();
  });

  it('una factura en borrador sin rastro se borra con sus líneas y queda registrada', async () => {
    const { svc, destroy, linesDestroy, record } = servicio(
      { status: 'DRAFT', accountingDocumentId: null, invoiceNo: 'FAC-AR-2' },
      { cobros: '0', fiscal: '0' },
    );
    await expect(svc.deleteInvoice('f-1', user as never)).resolves.toEqual({
      id: 'f-1',
      deleted: true,
    });
    expect(linesDestroy).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ actionCode: 'DELETE_DRAFT_AR_INVOICE' }),
    );
  });
});
