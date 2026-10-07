import type { Request } from 'express';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { CreditProductsGatewayController } from './credit-products-gateway.controller';

/**
 * Los productos de crédito se configuran desde el ERP; el Core decide. La pasarela sólo reenvía, con el token
 * del actor y a la ruta correcta, y sólo la ven los roles internos (nunca el comercio: los productos son de Atlas).
 */
describe('CreditProductsGatewayController', () => {
  function build() {
    const forward = jest.fn(async (input: unknown) => ({ ok: true, input }));
    const controller = new CreditProductsGatewayController({ forward } as never);
    const req = { cookies: { atlas_upstream_at: 'token-del-actor' } } as unknown as Request;
    return { controller, forward, req };
  }

  it('lista reenviando a operations/credit/products con el token del actor', async () => {
    const { controller, forward, req } = build();
    await controller.list(req);
    expect(forward).toHaveBeenCalledWith({
      method: 'GET',
      path: 'operations/credit/products',
      accessToken: 'token-del-actor',
    });
  });

  it('crea reenviando el cuerpo tal cual: los rangos los valida el Core', async () => {
    const { controller, forward, req } = build();
    const body = { productCode: 'bnpl_base', minAmount: 50, maxAmount: 5000 };
    await controller.create(req, body);
    expect(forward).toHaveBeenCalledWith({
      method: 'POST',
      path: 'operations/credit/products',
      accessToken: 'token-del-actor',
      body,
    });
  });

  it('cambia el estado por id, escapando el identificador', async () => {
    const { controller, forward, req } = build();
    await controller.changeStatus(req, '12/../x', { status: 'active', reasonCode: 'ERP' });
    expect(forward).toHaveBeenCalledWith({
      method: 'PATCH',
      path: 'operations/credit/products/12%2F..%2Fx/status',
      accessToken: 'token-del-actor',
      body: { status: 'active', reasonCode: 'ERP' },
    });
  });

  it('sin cookie reenvía sin token: es el Core quien responde 401', async () => {
    const { controller, forward } = build();
    await controller.list({ cookies: {} } as unknown as Request);
    expect(forward).toHaveBeenCalledWith(expect.objectContaining({ accessToken: undefined }));
  });

  it.each(['list', 'create', 'changeStatus'] as const)(
    '%s es sólo de roles internos, nunca del comercio',
    (metodo) => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        CreditProductsGatewayController.prototype[metodo],
      ) as string[];
      expect(roles).toEqual(['OPERATIONS', 'ADMIN']);
      expect(roles.some((rol) => rol.startsWith('MERCHANT') || rol === 'merchant')).toBe(false);
    },
  );
});
