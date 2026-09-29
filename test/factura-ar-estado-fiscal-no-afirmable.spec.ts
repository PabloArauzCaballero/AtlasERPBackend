import { UnprocessableEntityException } from '@nestjs/common';
import { env } from '../src/config/env';
import { BillingService } from '../src/modules/accounting/billing/services/billing.service';

/**
 * WP14-ERPB P1-2: el cliente no puede afirmar el estado fiscal de una factura AR.
 *
 * Con `SIAT_MODE=disabled` (defecto) el cuerpo `electronicTaxDocument` se persistía tal cual: una
 * factura quedaba `ACCEPTED` con CUF, CUFD y hash inventados. Ahora se rechaza en todos los modos,
 * antes de abrir la transacción o leer nada de la base.
 */
describe('factura AR: el estado fiscal no lo afirma el cliente', () => {
  const modoOriginal = env.SIAT_MODE;
  afterEach(() => {
    (env as { SIAT_MODE: string }).SIAT_MODE = modoOriginal;
  });

  function servicio() {
    const svc = Object.create(BillingService.prototype) as BillingService;
    const transaction = jest.fn();
    const prepararEmisionFiscal = jest.fn(async () => null);
    Object.assign(svc, {
      logger: { info: jest.fn(), debug: jest.fn() },
      legalEntityAccessService: { assertCanAccessLegalEntity: jest.fn() },
      sequelize: { transaction },
      prepararEmisionFiscal,
    });
    return { svc, transaction, prepararEmisionFiscal };
  }
  const cuerpo = (electronicTaxDocument: Record<string, unknown>) =>
    ({
      legalEntityId: 'le',
      customerBpId: 'bp',
      electronicTaxDocument,
    }) as never;
  const user = { sub: 'u-1' } as never;

  it.each(['disabled', 'mock_server', 'piloto', 'produccion'])(
    'con SIAT_MODE=%s rechaza un documento ACCEPTED con CUF inventado y no toca la base',
    async (modo) => {
      (env as { SIAT_MODE: string }).SIAT_MODE = modo;
      const { svc, transaction, prepararEmisionFiscal } = servicio();
      const promesa = svc.issueInvoice(
        cuerpo({
          siatStatus: 'ACCEPTED',
          cuf: 'CUF-INVENTADO',
          cufd: 'CUFD-INVENTADO',
          xmlHash: 'a'.repeat(64),
          emittedAt: new Date(),
          contingencyFlag: false,
        }),
        user,
      );
      await expect(promesa).rejects.toBeInstanceOf(UnprocessableEntityException);
      await expect(promesa).rejects.toMatchObject({
        response: { code: 'FISCAL_STATUS_NOT_CLIENT_ASSERTED' },
      });
      expect(prepararEmisionFiscal).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('también rechaza un documento PENDING sin datos: el cliente no crea documentos fiscales', async () => {
    const { svc, transaction } = servicio();
    await expect(
      svc.issueInvoice(cuerpo({ siatStatus: 'PENDING', contingencyFlag: false }), user),
    ).rejects.toMatchObject({ response: { code: 'FISCAL_STATUS_NOT_CLIENT_ASSERTED' } });
    expect(transaction).not.toHaveBeenCalled();
  });
});
