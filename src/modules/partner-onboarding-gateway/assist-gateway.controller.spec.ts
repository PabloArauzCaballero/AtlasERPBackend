import { HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../common/types/auth-context.types';
import { AssistGatewayController, superficieDeLaSesion } from './assist-gateway.controller';

/**
 * La pasarela del asistente reenvía a Core con el token del actor y fija la superficie por el TIPO
 * de sesión. Lo que cuidan estas pruebas es lo que no se ve en pantalla hasta que falla: que un
 * comercio no pueda pedir el catálogo del personal mandando otra `surface`, y que el código y el
 * `Retry-After` del asistente lleguen al navegador en vez de convertirse en un 500 genérico.
 */
describe('AssistGatewayController', () => {
  const comercio: AuthUser = { sub: 'u-1', roleCode: 'MERCHANT_ADMIN', roles: ['MERCHANT_ADMIN'] };
  const personal: AuthUser = {
    sub: 'u-2',
    atlasUserId: 'a-2',
    roleCode: 'OPERATIONS',
    roles: ['OPERATIONS', 'ADS_OPS_MONITOR'],
  };
  const req = { cookies: { atlas_upstream_at: 'token-del-actor' } } as unknown as Request;

  function respuesta(status: number, cuerpo: unknown, cabeceras: Record<string, string> = {}) {
    return new globalThis.Response(JSON.stringify(cuerpo), {
      status,
      headers: { 'content-type': 'application/json', ...cabeceras },
    });
  }

  function res() {
    return { setHeader: jest.fn() } as unknown as Response & { setHeader: jest.Mock };
  }

  let fetchMock: jest.SpyInstance;
  afterEach(() => fetchMock?.mockRestore());

  describe('superficieDeLaSesion', () => {
    it('comercio → merchant-portal; personal → erp-staff', () => {
      expect(superficieDeLaSesion(comercio)).toBe('merchant-portal');
      expect(superficieDeLaSesion(personal)).toBe('erp-staff');
    });

    it('una sesión con roles mezclados (la de pruebas locales) es de personal', () => {
      expect(superficieDeLaSesion({ sub: 'x', roles: ['ADMIN', 'MERCHANT_ADMIN'] })).toBe(
        'erp-staff',
      );
    });

    it('una sesión sin roles no se vuelve de comercio', () => {
      expect(superficieDeLaSesion({ sub: 'x', roles: [] })).toBe('erp-staff');
    });
  });

  it('el chat de un comercio va a Core con merchant-portal aunque el navegador pida erp-staff', async () => {
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      respuesta(200, {
        requestId: 'r',
        data: { reply: 'Hola', suggestHandoff: false, conversationId: 'c', turnId: 't' },
      }),
    );

    const resultado = await new AssistGatewayController().chat(
      req,
      comercio,
      {
        surface: 'erp-staff',
        prompt: '¿Dónde veo mis ventas?',
        clientMessageId: '0b6c2a8e-6d3f-4c9e-9f1a-2b3c4d5e6f70',
        screen: 'Cartera',
        extra: 'no cruza',
      },
      res(),
    );

    expect(resultado).toEqual({
      reply: 'Hola',
      suggestHandoff: false,
      conversationId: 'c',
      turnId: 't',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/internal\/assist\/chat$/);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-del-actor');
    expect(JSON.parse(init.body as string)).toEqual({
      surface: 'merchant-portal',
      prompt: '¿Dónde veo mis ventas?',
      clientMessageId: '0b6c2a8e-6d3f-4c9e-9f1a-2b3c4d5e6f70',
      screen: 'Cartera',
    });
  });

  it('la conversación del personal se pide con surface=erp-staff', async () => {
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(respuesta(200, { data: { conversationId: null, turns: [] } }));

    const resultado = await new AssistGatewayController().conversacion(req, personal, res());

    expect(resultado).toEqual({ conversationId: null, turns: [] });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/internal\/assist\/conversation\?surface=erp-staff$/);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('conserva el 409 ASSIST_IN_FLIGHT y su Retry-After', async () => {
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        respuesta(
          409,
          { error: { code: 'ASSIST_IN_FLIGHT', message: 'La consulta sigue en curso.' } },
          { 'retry-after': '2' },
        ),
      );
    const salida = res();

    const error = await new AssistGatewayController()
      .chat(req, personal, { prompt: 'hola', clientMessageId: 'x' }, salida)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(409);
    expect((error as HttpException).getResponse()).toEqual({
      code: 'ASSIST_IN_FLIGHT',
      message: 'La consulta sigue en curso.',
    });
    expect(salida.setHeader).toHaveBeenCalledWith('Retry-After', '2');
  });

  it('conserva el 404 ASSIST_DISABLED y el 429 ASSIST_BUSY (no los vuelve 500)', async () => {
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        respuesta(404, { error: { code: 'ASSIST_DISABLED', message: 'Apagado.' } }),
      )
      .mockResolvedValueOnce(
        respuesta(429, { error: { code: 'ASSIST_BUSY', message: 'Ocupado.' } }),
      );
    const controller = new AssistGatewayController();

    const apagado = (await controller
      .conversacion(req, personal, res())
      .catch((e) => e)) as HttpException;
    const ocupado = (await controller
      .chat(req, personal, { prompt: 'hola', clientMessageId: 'x' }, res())
      .catch((e) => e)) as HttpException;

    expect([apagado.getStatus(), apagado.getResponse()]).toEqual([
      404,
      { code: 'ASSIST_DISABLED', message: 'Apagado.' },
    ]);
    expect([ocupado.getStatus(), ocupado.getResponse()]).toEqual([
      429,
      { code: 'ASSIST_BUSY', message: 'Ocupado.' },
    ]);
  });

  it('sin respuesta de Core contesta 503 ASSIST_UNAVAILABLE', async () => {
    fetchMock = jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

    const error = (await new AssistGatewayController()
      .chat(req, personal, { prompt: 'hola', clientMessageId: 'x' }, res())
      .catch((e) => e)) as HttpException;

    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'ASSIST_UNAVAILABLE' }));
  });

  it('sin cookie de identidad no llama a Core', async () => {
    fetchMock = jest.spyOn(global, 'fetch');

    const error = (await new AssistGatewayController()
      .conversacion({ cookies: {} } as unknown as Request, personal, res())
      .catch((e) => e)) as HttpException;

    expect(error.getStatus()).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
