import type { NextFunction, Request, Response } from 'express';
import { of } from 'rxjs';
import { LoggingInterceptor } from '../src/common/interceptors/logging.interceptor';
import { RequestContextMiddleware } from '../src/common/middleware/request-context.middleware';

/**
 * El portal del ERP manda `x-correlation-id` en cada petición para poder seguirla. Este backend sólo
 * leía `x-request-id`, así que ese id se descartaba sin error y cada petición estrenaba otro: la
 * correlación existía en el cliente y en ningún otro sitio.
 */
type RequestConId = Request & { requestId?: string };

function pasarMiddleware(cabeceras: Record<string, string>) {
  const request = {
    header: (nombre: string) => cabeceras[nombre.toLowerCase()],
  } as unknown as RequestConId;
  const devueltas: Record<string, string> = {};
  const response = {
    setHeader: (nombre: string, valor: string) => (devueltas[nombre] = valor),
  } as unknown as Response;
  const next = jest.fn() as unknown as NextFunction;
  new RequestContextMiddleware().use(request, response, next);
  return { requestId: request.requestId, devueltas, next };
}

describe('RequestContextMiddleware · de dónde sale el id de la petición', () => {
  it('toma el x-correlation-id que manda el portal del ERP', () => {
    const { requestId, devueltas, next } = pasarMiddleware({
      'x-correlation-id': '8f14e45f-ceea-467f-a0e6-0f5b2a9d7c11',
    });
    expect(requestId).toBe('8f14e45f-ceea-467f-a0e6-0f5b2a9d7c11');
    expect(devueltas['X-Request-Id']).toBe('8f14e45f-ceea-467f-a0e6-0f5b2a9d7c11');
    expect(next).toHaveBeenCalled();
  });

  it('x-request-id manda cuando llegan los dos', () => {
    const { requestId } = pasarMiddleware({
      'x-request-id': 'gateway-12345',
      'x-correlation-id': 'cliente-67890',
    });
    expect(requestId).toBe('gateway-12345');
  });

  it('un valor inseguro no se refleja: se pasa al siguiente o se genera uno', () => {
    expect(
      pasarMiddleware({ 'x-request-id': 'no <vale>', 'x-correlation-id': 'cliente-67890' })
        .requestId,
    ).toBe('cliente-67890');
    const generado = pasarMiddleware({ 'x-correlation-id': 'corto' }).requestId;
    expect(generado).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('LoggingInterceptor · usa el id que resolvió el middleware', () => {
  it('no relee la cabecera con otro patrón: una petición, un id', () => {
    const interceptor = new LoggingInterceptor(
      { infoContext: jest.fn(), warnContext: jest.fn() } as never,
      { record: jest.fn() } as never,
    );
    // `abc` cabe en el patrón del interceptor (1-120) y no en el del middleware (8-120): antes daba
    // un id en el middleware y otro distinto aquí.
    const request = {
      requestId: 'resuelto-en-middleware',
      header: () => 'abc',
      method: 'GET',
      url: '/x',
      originalUrl: '/x',
    };
    const devueltas: Record<string, string> = {};
    const response = {
      setHeader: (nombre: string, valor: string) => (devueltas[nombre] = valor),
      once: jest.fn(),
      statusCode: 200,
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    } as never;

    interceptor.intercept(context, { handle: () => of(null) }).subscribe();

    expect(devueltas['X-Request-Id']).toBe('resuelto-en-middleware');
  });
});
