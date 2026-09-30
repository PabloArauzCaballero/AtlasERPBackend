import type { Request } from 'express';
import { SupportGatewayController } from '../src/modules/partner-onboarding-gateway/support-gateway.controller';

/**
 * Cubre el hallazgo UNTESTED_WRITE: cinco rutas de escritura de soporte sin ningún test que las
 * nombrara por su ruta HTTP: `POST merchant/support/cases`, `POST support/channels`,
 * `POST support/channels/:id/close`, `POST support/channels/:id/messages`,
 * `POST support/channels/:id/read` y `POST support/channels/:id/typing`. Pasarela pura (ver
 * cabecera del controlador): se fija el reenvío exacto hacia AtlasBackend, no el negocio. La
 * protección de rol está en `test/untested-writes-roles-guard.spec.ts`.
 */
describe('SupportGatewayController: rutas de escritura sin test previo', () => {
  function build() {
    const forward = jest.fn(async (input: unknown) => ({ ok: true, input }));
    const controller = new SupportGatewayController({ forward } as never);
    const req = { cookies: { atlas_upstream_at: 'token-del-actor' } } as unknown as Request;
    return { controller, forward, req };
  }

  it('POST merchant/support/cases abre el caso con el token del actor', async () => {
    const { controller, forward, req } = build();
    const body = { categoryId: 'pagos', subject: 'No me llegó la transferencia' };
    await controller.abrirCaso(req, body);
    expect(forward).toHaveBeenCalledWith({
      method: 'POST',
      path: 'merchant/support/cases',
      accessToken: 'token-del-actor',
      body,
    });
  });

  it('POST merchant/support/cases sin cookie reenvía sin token (AtlasBackend responde 401)', async () => {
    const { controller, forward } = build();
    await controller.abrirCaso({ cookies: {} } as unknown as Request, {});
    expect(forward).toHaveBeenCalledWith(expect.objectContaining({ accessToken: undefined }));
  });

  it('POST support/channels abre la conversación con el cuerpo intacto', async () => {
    const { controller, forward, req } = build();
    const body = { subject: 'Duda sobre un cobro' };
    await controller.abrirConversacion(req, body);
    expect(forward).toHaveBeenCalledWith({
      method: 'POST',
      path: 'support/channels',
      accessToken: 'token-del-actor',
      body,
    });
  });

  it('POST support/channels/:id/messages envía el mensaje al canal correcto', async () => {
    const { controller, forward, req } = build();
    const body = { text: 'Hola, necesito ayuda' };
    await controller.enviar(req, 'ch-1', body);
    expect(forward).toHaveBeenCalledWith({
      method: 'POST',
      path: 'support/channels/ch-1/messages',
      accessToken: 'token-del-actor',
      body,
    });
  });

  it('POST support/channels/:id/read marca leído el canal correcto', async () => {
    const { controller, forward, req } = build();
    const body = { upToSequence: 5 };
    await controller.marcarLeido(req, 'ch-1', body);
    expect(forward).toHaveBeenCalledWith({
      method: 'POST',
      path: 'support/channels/ch-1/read',
      accessToken: 'token-del-actor',
      body,
    });
  });

  it('POST support/channels/:id/typing avisa que se está escribiendo, sin cuerpo', async () => {
    const { controller, forward, req } = build();
    await controller.escribiendo(req, 'ch-1');
    expect(forward).toHaveBeenCalledWith({
      method: 'POST',
      path: 'support/channels/ch-1/typing',
      accessToken: 'token-del-actor',
    });
  });

  it('POST support/channels/:id/close cierra el canal correcto', async () => {
    const { controller, forward, req } = build();
    const body = { reason: 'resuelto' };
    await controller.cerrar(req, 'ch-1', body);
    expect(forward).toHaveBeenCalledWith({
      method: 'POST',
      path: 'support/channels/ch-1/close',
      accessToken: 'token-del-actor',
      body,
    });
  });

  it('las rutas con :channelId codifican el identificador', async () => {
    const { controller, forward, req } = build();
    await controller.enviar(req, 'canal/raro', {});
    expect(forward).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'support/channels/canal%2Fraro/messages' }),
    );
  });
});
