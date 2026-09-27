import { UnprocessableEntityException } from '@nestjs/common';
import { BillingService } from '../src/modules/accounting/billing/services/billing.service';

/**
 * La factura AR con facturación electrónica activa: se fecha el día en que se emite y necesita el
 * producto del SIN por defecto del emisor (la AR no tiene catálogo de productos).
 */
describe('factura AR con SIAT activo: guardas previas a la transacción', () => {
  const perfil = { productoSinDefault: '49111', unidadMedidaDefault: 58 };
  function servicio(opciones: {
    activo?: boolean;
    productoSinDefault?: string | null;
    hoy?: string;
  }) {
    const svc = Object.create(BillingService.prototype) as BillingService;
    const fiscal = {
      activo: opciones.activo ?? true,
      preparar: jest.fn(async () => ({
        perfil: {
          ...perfil,
          productoSinDefault:
            opciones.productoSinDefault === undefined ? '49111' : opciones.productoSinDefault,
        },
      })),
      fechaDeEmisionHoy: jest.fn(() => opciones.hoy ?? '2026-09-27'),
    };
    Object.assign(svc, {
      fiscal,
      businessPartnerModel: {
        findByPk: jest.fn(async () => ({ taxId: '1020304050', taxDocumentType: 5 })),
      },
    });
    return {
      svc: svc as unknown as { prepararEmisionFiscal(input: unknown): Promise<unknown> },
      fiscal,
    };
  }
  const input = (fecha: string) => ({
    legalEntityId: 'le',
    customerBpId: 'bp',
    invoiceDate: new Date(`${fecha}T00:00:00.000Z`),
  });

  it('con SIAT apagado no prepara nada', async () => {
    const { svc, fiscal } = servicio({ activo: false });
    expect(await svc.prepararEmisionFiscal(input('2026-09-20'))).toBeNull();
    expect(fiscal.preparar).not.toHaveBeenCalled();
  });

  it('una fecha que no es la de emisión es 422 FISCAL_INVOICE_DATE_MUST_BE_TODAY', async () => {
    const { svc } = servicio({});
    await expect(svc.prepararEmisionFiscal(input('2026-09-20'))).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FISCAL_INVOICE_DATE_MUST_BE_TODAY' }),
    });
  });

  it('sin producto del SIN por defecto en el emisor es 422 y dice dónde configurarlo', async () => {
    const { svc } = servicio({ productoSinDefault: null });
    const error = await svc.prepararEmisionFiscal(input('2026-09-27')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
      code: 'FISCAL_PRODUCT_NOT_HOMOLOGATED',
      message: expect.stringContaining('Emisor'),
    });
  });

  it('con fecha de hoy y producto configurado, prepara la emisión con el NIT del cliente', async () => {
    const { svc, fiscal } = servicio({});
    expect(await svc.prepararEmisionFiscal(input('2026-09-27'))).not.toBeNull();
    expect(fiscal.preparar).toHaveBeenCalledWith('le', {
      codigoTipoDocumentoIdentidad: 5,
      numeroDocumento: '1020304050',
    });
  });
});
