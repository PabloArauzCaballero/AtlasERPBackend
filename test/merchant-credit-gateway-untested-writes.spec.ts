import type { Request } from 'express';
import { MerchantCreditGatewayController } from '../src/modules/partner-onboarding-gateway/merchant-credit-gateway.controller';

/**
 * Cubre el hallazgo UNTESTED_WRITE: `POST merchant-credit/:id/applications/:appId/acceptance` y
 * `POST merchant-credit/:id/payment-claims/:claimId/verification` no tenían ningún test que los
 * nombrara por su ruta HTTP. Pasarela pura (ver cabecera del controlador): se fija el reenvío
 * exacto hacia AtlasBackend, no el negocio. La protección de rol está en
 * `test/untested-writes-roles-guard.spec.ts`.
 */
describe('MerchantCreditGatewayController: rutas de escritura sin test previo', () => {
  function build() {
    const forward = jest.fn(async (input: unknown) => ({ ok: true, input }));
    const controller = new MerchantCreditGatewayController({ forward } as never);
    const req = { cookies: { atlas_upstream_at: 'token-del-actor' } } as unknown as Request;
    return { controller, forward, req };
  }

  it('POST merchant-credit/:id/applications/:appId/acceptance reenvía la decisión con el token del actor', async () => {
    const { controller, forward, req } = build();
    const body = { accepted: true, notes: 'de acuerdo' };
    await controller.decide(req, 'partner-1', 'app-9', body);
    expect(forward).toHaveBeenCalledWith({
      method: 'POST',
      path: 'merchant/partners/partner-1/credit-applications/app-9/acceptance',
      accessToken: 'token-del-actor',
      body,
    });
  });

  it('POST merchant-credit/:id/applications/:appId/acceptance sin cookie reenvía sin token (AtlasBackend responde 401)', async () => {
    const { controller, forward } = build();
    await controller.decide({ cookies: {} } as unknown as Request, 'partner-1', 'app-9', {
      accepted: false,
    });
    expect(forward).toHaveBeenCalledWith(expect.objectContaining({ accessToken: undefined }));
  });

  it('POST merchant-credit/:id/payment-claims/:claimId/verification reenvía la verificación', async () => {
    const { controller, forward, req } = build();
    const body = { confirmed: true };
    await controller.verifyPaymentClaim(req, 'partner-1', 'claim-7', body);
    expect(forward).toHaveBeenCalledWith({
      method: 'POST',
      path: 'merchant/partners/partner-1/payment-claims/claim-7/verification',
      accessToken: 'token-del-actor',
      body,
    });
  });

  it('POST merchant-credit/:id/payment-claims/:claimId/verification codifica los identificadores de la ruta', async () => {
    const { controller, forward, req } = build();
    await controller.verifyPaymentClaim(req, 'partner/raro', 'claim/raro', {});
    expect(forward).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'merchant/partners/partner%2Fraro/payment-claims/claim%2Fraro/verification',
      }),
    );
  });
});
