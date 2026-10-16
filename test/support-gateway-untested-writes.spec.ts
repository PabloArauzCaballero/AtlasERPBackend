import type { Request } from 'express';
import { SupportGatewayController } from '../src/modules/partner-onboarding-gateway/support-gateway.controller';
import { SupportChannelsGatewayController } from '../src/modules/partner-onboarding-gateway/support-channels-gateway.controller';

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
    const channels = new SupportChannelsGatewayController({ forward } as never);
    const req = { cookies: { atlas_upstream_at: 'token-del-actor' } } as unknown as Request;
    return { controller, channels, forward, req };
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
    const { channels, forward, req } = build();
    const body = { subject: 'Duda sobre un cobro' };
    await channels.abrirConversacion(req, body);
    expect(forward).toHaveBeenCalledWith({
      method: 'POST',
      path: 'support/channels',
      accessToken: 'token-del-actor',
      body,
    });
  });

  it('POST support/channels/:id/messages envía el mensaje al canal correcto', async () => {
    const { channels, forward, req } = build();
    const body = { text: 'Hola, necesito ayuda' };
    await channels.enviar(req, 'ch-1', body);
    expect(forward).toHaveBeenCalledWith({
      method: 'POST',
      path: 'support/channels/ch-1/messages',
      accessToken: 'token-del-actor',
      body,
    });
  });

  it('POST support/channels/:id/read marca leído el canal correcto', async () => {
    const { channels, forward, req } = build();
    const body = { upToSequence: 5 };
    await channels.marcarLeido(req, 'ch-1', body);
    expect(forward).toHaveBeenCalledWith({
      method: 'POST',
      path: 'support/channels/ch-1/read',
      accessToken: 'token-del-actor',
      body,
    });
  });

  it('POST support/channels/:id/typing avisa que se está escribiendo, sin cuerpo', async () => {
    const { channels, forward, req } = build();
    await channels.escribiendo(req, 'ch-1');
    expect(forward).toHaveBeenCalledWith({
      method: 'POST',
      path: 'support/channels/ch-1/typing',
      accessToken: 'token-del-actor',
    });
  });

  it('POST support/channels/:id/close cierra el canal correcto', async () => {
    const { channels, forward, req } = build();
    const body = { reason: 'resuelto' };
    await channels.cerrar(req, 'ch-1', body);
    expect(forward).toHaveBeenCalledWith({
      method: 'POST',
      path: 'support/channels/ch-1/close',
      accessToken: 'token-del-actor',
      body,
    });
  });

  it('las rutas con :channelId codifican el identificador', async () => {
    const { channels, forward, req } = build();
    await channels.enviar(req, 'canal/raro', {});
    expect(forward).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'support/channels/canal%2Fraro/messages' }),
    );
  });
});
