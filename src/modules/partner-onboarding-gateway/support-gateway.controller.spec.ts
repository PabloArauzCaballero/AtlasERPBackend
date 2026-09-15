import type { Request } from 'express';
import { SupportGatewayController } from './support-gateway.controller';

/**
 * La pasarela de soporte reenvía CADA ruta que el portal del comercio usa, con el token del actor.
 *
 * `merchant/support/categories` no estaba: AtlasBackend la publicaba, el portal la pedía, y el 404
 * lo daba este servicio. La pantalla lo escondía con un `.catch` y el catálogo de motivos salía
 * vacío para siempre. Esta prueba fija el reenvío y el token; si alguien vuelve a quitar la ruta,
 * cae aquí y no en producción.
 */
describe('SupportGatewayController', () => {
  function build() {
    const forward = jest.fn(async (input: unknown) => ({ ok: true, input }));
    const controller = new SupportGatewayController({ forward } as never);
    const req = { cookies: { atlas_upstream_at: 'token-del-actor' } } as unknown as Request;
    return { controller, forward, req };
  }

  it('reenvía GET merchant/support/categories con el token del actor', async () => {
    const { controller, forward, req } = build();
    await controller.motivos(req);
    expect(forward).toHaveBeenCalledWith({
      method: 'GET',
      path: 'merchant/support/categories',
      accessToken: 'token-del-actor',
    });
  });

  it('sin cookie reenvía sin token: es AtlasBackend quien responde 401, no esta pasarela', async () => {
    const { controller, forward } = build();
    await controller.motivos({ cookies: {} } as unknown as Request);
    expect(forward).toHaveBeenCalledWith(expect.objectContaining({ accessToken: undefined }));
  });

  it.each([
    ['faq', 'merchant/support/faq'],
    ['sinLeer', 'support/channels/unread'],
  ] as const)('%s reenvía a %s', async (metodo, path) => {
    const { controller, forward, req } = build();
    await (controller[metodo] as (r: Request) => Promise<unknown>)(req);
    expect(forward).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET', path }));
  });
});
