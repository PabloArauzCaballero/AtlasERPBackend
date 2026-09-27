import { NotFoundException } from '@nestjs/common';
import { gzipSync } from 'node:zlib';
import { PortalFiscalService } from '../src/modules/portal/portal-fiscal.service';

/**
 * El comercio descarga SU factura fiscal: sólo de sus cuentas y sólo cuando el documento ya es
 * factura (validada, observada, fuera de línea o anulada), nunca uno en cola o rechazado.
 */
describe('factura fiscal en el portal del comercio', () => {
  const scope = { accountIds: ['cuenta-A'] } as never;
  const factura = { id: 'fac-1', accountId: 'cuenta-A' };

  function servicio(documento: Record<string, unknown> | null, facturaEncontrada = factura) {
    const scopeService = {
      resolveAccountId: jest.fn((_s: unknown, pedido?: string) => pedido ?? 'cuenta-A'),
    };
    const invoiceModel = {
      findOne: jest.fn(async ({ where }: { where: { accountId: string } }) =>
        where.accountId === facturaEncontrada?.accountId ? facturaEncontrada : null,
      ),
    };
    const documentModel = { findOne: jest.fn(async () => documento) };
    const fiscalPdf = {
      pdf: jest.fn(async () => ({ buffer: Buffer.from('%PDF'), filename: 'f.pdf' })),
    };
    return {
      svc: new PortalFiscalService(
        scopeService as never,
        fiscalPdf as never,
        invoiceModel as never,
        documentModel as never,
      ),
      fiscalPdf,
    };
  }

  it('una factura de otra cuenta es 404', async () => {
    const { svc } = servicio({ siatStatus: 'ACCEPTED', xmlGzip: gzipSync('<x/>') });
    await expect(svc.pdf(scope, 'fac-1', 'cuenta-B')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('un documento todavía en cola no se descarga', async () => {
    const { svc, fiscalPdf } = servicio({ siatStatus: 'QUEUED', xmlGzip: gzipSync('<x/>') });
    await expect(svc.pdf(scope, 'fac-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FISCAL_DOCUMENT_NOT_AVAILABLE' }),
    });
    expect(fiscalPdf.pdf).not.toHaveBeenCalled();
    expect(await svc.resumen(scope, 'fac-1')).toMatchObject({
      siatStatus: 'QUEUED',
      descargable: false,
    });
  });

  it('una factura validada entrega PDF y el XML tal como se envió', async () => {
    const { svc } = servicio({
      id: 'doc-1',
      numeroFactura: '7',
      siatStatus: 'ACCEPTED',
      xmlGzip: gzipSync('<facturaComputarizadaCompraVenta/>'),
    });
    expect((await svc.pdf(scope, 'fac-1')).filename).toBe('f.pdf');
    const { xml, filename } = await svc.xml(scope, 'fac-1');
    expect(xml.toString()).toBe('<facturaComputarizadaCompraVenta/>');
    expect(filename).toBe('factura-7.xml');
  });

  it('sin documento fiscal el resumen es null', async () => {
    const { svc } = servicio(null);
    expect(await svc.resumen(scope, 'fac-1')).toBeNull();
  });
});
