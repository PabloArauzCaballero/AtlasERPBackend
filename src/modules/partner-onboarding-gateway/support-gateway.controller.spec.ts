import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
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

  it('pausa el lector SSE cuando la respuesta al navegador aplica contrapresión', async () => {
    const { controller } = build();
    const req = Object.assign(new EventEmitter(), {
      cookies: { atlas_upstream_at: 'token-del-actor' },
    }) as unknown as Request;
    const write = jest.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const res = Object.assign(new EventEmitter(), {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write,
      end: jest.fn(),
      destroyed: false,
    }) as unknown as Response;
    const reader = {
      read: jest
        .fn()
        .mockResolvedValueOnce({ done: false, value: Uint8Array.of(1) })
        .mockResolvedValueOnce({ done: false, value: Uint8Array.of(2) })
        .mockResolvedValue({ done: true }),
      cancel: jest.fn().mockResolvedValue(undefined),
    };
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, body: { getReader: () => reader } } as never);

    try {
      const streaming = controller.hiloEnVivo(req, 'ch-1', res);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(write).toHaveBeenCalledTimes(1);
      expect(reader.read).toHaveBeenCalledTimes(1);
      const signal = (fetchMock.mock.calls[0]?.[1] as RequestInit).signal as AbortSignal;
      req.emit('close');
      expect(signal.aborted).toBe(false);

      res.emit('drain');
      await streaming;
      expect(write).toHaveBeenCalledTimes(2);
      expect(res.end).toHaveBeenCalledTimes(1);
      expect(signal.aborted).toBe(true);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('al cerrar el navegador aborta el upstream mientras espera drain', async () => {
    const { controller } = build();
    const req = { cookies: { atlas_upstream_at: 'token-del-actor' } } as unknown as Request;
    const res = Object.assign(new EventEmitter(), {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(() => false),
      end: jest.fn(),
      destroyed: false,
    }) as unknown as Response;
    const reader = { read: jest.fn().mockResolvedValue({ done: false, value: Uint8Array.of(1) }) };
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, body: { getReader: () => reader } } as never);

    try {
      const streaming = controller.hiloEnVivo(req, 'ch-1', res);
      await new Promise<void>((resolve) => setImmediate(resolve));
      const signal = (fetchMock.mock.calls[0]?.[1] as RequestInit).signal as AbortSignal;
      res.destroyed = true;
      res.emit('close');
      await streaming;
      expect(signal.aborted).toBe(true);
      expect(reader.read).toHaveBeenCalledTimes(1);
      expect(res.end).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('no intenta escribir un error si el navegador se cerró durante la conexión upstream', async () => {
    const { controller } = build();
    const req = { cookies: { atlas_upstream_at: 'token-del-actor' } } as unknown as Request;
    const res = Object.assign(new EventEmitter(), {
      status: jest.fn(),
      json: jest.fn(),
      destroyed: false,
    }) as unknown as Response;
    let finishFetch: ((value: unknown) => void) | undefined;
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(
      () =>
        new Promise((resolve) => {
          finishFetch = resolve;
        }) as never,
    );

    try {
      const streaming = controller.hiloEnVivo(req, 'ch-1', res);
      const signal = (fetchMock.mock.calls[0]?.[1] as RequestInit).signal as AbortSignal;
      res.destroyed = true;
      res.emit('close');
      finishFetch?.({ ok: false });
      await streaming;
      expect(signal.aborted).toBe(true);
      expect(res.status).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });
});
