import type { Request } from 'express';
import {
  filtrosDeHistorial,
  MerchantCreditGatewayController,
} from '../src/modules/partner-onboarding-gateway/merchant-credit-gateway.controller';

/**
 * El historial del POS (Pablo, 2026-10-08): la pasarela reenvía SOLO los filtros conocidos —sucursal, caja, desde,
 * hasta y página—, codificados, con el token del actor. El dominio lo valida AtlasBackend.
 */
describe('MerchantCreditGatewayController: historial del POS', () => {
  it('reenvía los filtros conocidos y descarta los demás', async () => {
    const forward = jest.fn(async (input: unknown) => input);
    const controller = new MerchantCreditGatewayController({ forward } as never);
    const req = { cookies: { atlas_upstream_at: 'tok' } } as unknown as Request;
    await controller.posHistory(req, '7', {
      branchId: '1',
      terminalId: '5',
      from: '2026-10-01',
      to: '2026-10-08',
      page: '2',
      x: 'no',
    });
    expect(forward).toHaveBeenCalledWith({
      method: 'GET',
      path: 'merchant/partners/7/payment-claims/pos-history?branchId=1&terminalId=5&from=2026-10-01&to=2026-10-08&page=2',
      accessToken: 'tok',
    });
  });

  it('sin filtros no añade query, y codifica lo que viaja', () => {
    expect(filtrosDeHistorial({})).toBe('');
    expect(filtrosDeHistorial({ branchId: '1&admin=1' })).toBe('?branchId=1%26admin%3D1');
  });
});
