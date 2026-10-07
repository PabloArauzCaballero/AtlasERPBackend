import type { Request, Response } from 'express';
import { MerchantCreditGatewayController } from './merchant-credit-gateway.controller';

/**
 * El pago INICIAL llega al comercio por esta pasarela: lista, comprobante y decisión. Si una ruta falta, el
 * comprobante del cliente se queda sin destino y el comercio no puede confirmar nada (2026-10-07).
 */
describe('MerchantCreditGatewayController · pago inicial', () => {
  function build() {
    const forward = jest.fn(async (input: unknown) => ({ ok: true, input }));
    const forwardBinary = jest.fn(async () => ({
      contentType: 'image/jpeg',
      buffer: Buffer.from('img'),
    }));
    const controller = new MerchantCreditGatewayController({ forward, forwardBinary } as never);
    const req = { cookies: { atlas_upstream_at: 'token-del-actor' } } as unknown as Request;
    return { controller, forward, forwardBinary, req };
  }

  it('lista los pagos iniciales del comercio con el token del actor', async () => {
    const { controller, forward, req } = build();
    await controller.listDownPayments(req, '5');
    expect(forward).toHaveBeenCalledWith({
      method: 'GET',
      path: 'merchant/partners/5/down-payments',
      accessToken: 'token-del-actor',
    });
  });

  it('pasa el filtro onlyPending sin tocarlo', async () => {
    const { controller, forward, req } = build();
    await controller.listDownPayments(req, '5', 'false');
    expect(forward).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'merchant/partners/5/down-payments?onlyPending=false' }),
    );
  });

  it('sirve la imagen del comprobante con su tipo', async () => {
    const { controller, forwardBinary, req } = build();
    const setHeader = jest.fn();
    const imagen = await controller.downPaymentProof(req, '5', '70', {
      setHeader,
    } as unknown as Response);
    expect(forwardBinary).toHaveBeenCalledWith({
      method: 'GET',
      path: 'merchant/partners/5/down-payments/70/proof',
      accessToken: 'token-del-actor',
    });
    expect(setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    expect(imagen).toBeDefined();
  });

  it('reenvía la decisión tal cual y escapa los identificadores', async () => {
    const { controller, forward, req } = build();
    await controller.verifyDownPayment(req, '5', '70/../x', {
      verified: false,
      reason: 'No llegó',
    });
    expect(forward).toHaveBeenCalledWith({
      method: 'POST',
      path: 'merchant/partners/5/down-payments/70%2F..%2Fx/verification',
      accessToken: 'token-del-actor',
      body: { verified: false, reason: 'No llegó' },
    });
  });
});
