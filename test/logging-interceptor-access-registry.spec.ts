import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError, lastValueFrom, catchError } from 'rxjs';
import { HttpAccessRegistryService } from '../src/common/observability/http-access-registry.service';
import { LoggingInterceptor } from '../src/common/interceptors/logging.interceptor';

/**
 * Lo que este interceptor deja en el registro de accesos es la EVIDENCIA con la que Flujos decide si
 * una ruta del ERP está verificada o rota. Que el estado sea el de verdad no es un detalle de log:
 * un 400 contado como 500 marca BROKEN un flujo que hizo exactamente su trabajo —rechazar una
 * entrada inválida— y nadie lo notaría, porque el cliente sí recibió su 400.
 *
 * Se anota en `finish`, cuando la respuesta ya salió y el código es el definitivo. Por eso el doble
 * de respuesta emite ese evento y cada prueba fija el código al emitirlo: es lo que hace Express
 * cuando Nest, o el filtro de excepciones, ya ha puesto el suyo.
 */
function escenario(method: string, base: string, ruta: string) {
  const request = {
    method,
    baseUrl: base,
    route: { path: ruta },
    originalUrl: `${base}${ruta}`,
    url: `${base}${ruta}`,
    header: () => undefined,
    ip: '127.0.0.1',
  };
  const oyentes: Array<() => void> = [];
  const response = {
    statusCode: 200,
    setHeader: () => undefined,
    once: (evento: string, oyente: () => void) => {
      if (evento === 'finish') oyentes.push(oyente);
    },
  };
  const contexto = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
  /** Lo que hace Express al enviar la respuesta: fija el código definitivo y avisa. */
  const responder = (codigo: number) => {
    response.statusCode = codigo;
    for (const oyente of oyentes) oyente();
  };
  const registro = new HttpAccessRegistryService();
  const logger = { infoContext: () => undefined, warnContext: () => undefined } as never;
  return { contexto, responder, registro, interceptor: new LoggingInterceptor(logger, registro) };
}

const correr = (interceptor: LoggingInterceptor, contexto: ExecutionContext, next: CallHandler) =>
  lastValueFrom(interceptor.intercept(contexto, next).pipe(catchError(() => of(null))));

describe('LoggingInterceptor · lo que anota en el registro de accesos', () => {
  it('una respuesta correcta se anota con su ruta PLANTILLA, no con la URL concreta', async () => {
    const { interceptor, contexto, responder, registro } = escenario(
      'GET',
      '/api/v1',
      '/accounting/ar-invoices/:id',
    );

    await correr(interceptor, contexto, { handle: () => of({ ok: true }) });
    responder(200);

    expect(registro.snapshot().entries).toEqual([
      expect.objectContaining({
        method: 'GET',
        path: '/api/v1/accounting/ar-invoices/:id',
        ok: 1,
        failed: 0,
        lastStatus: 200,
      }),
    ]);
  });

  it('un POST que responde 201 se anota como 201, no como el 200 por defecto de Express', async () => {
    const { interceptor, contexto, responder, registro } = escenario(
      'POST',
      '/api/v1',
      '/accounting/ar-invoices',
    );

    await correr(interceptor, contexto, { handle: () => of({ id: 1 }) });
    responder(201);

    expect(registro.snapshot().entries[0]).toMatchObject({ lastStatus: 201, ok: 1, failed: 0 });
  });

  it.each([
    [new BadRequestException('id inválido'), 400],
    [new UnauthorizedException(), 401],
  ])(
    'un %s se anota con SU estado, no como 500: rechazar una entrada mal formada no es estar roto',
    async (error, esperado) => {
      const { interceptor, contexto, responder, registro } = escenario(
        'GET',
        '/api/v1',
        '/accounting/ar-invoices',
      );

      await correr(interceptor, contexto, { handle: () => throwError(() => error) });
      responder(esperado);

      expect(registro.snapshot().entries[0]).toMatchObject({
        lastStatus: esperado,
        ok: 1,
        failed: 0,
      });
    },
  );

  it('un fallo no previsto sí es un 500 y cuenta como fallido', async () => {
    const { interceptor, contexto, responder, registro } = escenario(
      'GET',
      '/api/v1',
      '/accounting/ar-invoices',
    );

    await correr(interceptor, contexto, {
      handle: () => throwError(() => new Error('la conexión se cayó')),
    });
    responder(500);

    expect(registro.snapshot().entries[0]).toMatchObject({ lastStatus: 500, ok: 0, failed: 1 });
  });

  it('si la respuesta nunca sale —conexión abortada— no se anota nada: no hubo desenlace que contar', async () => {
    const { interceptor, contexto, registro } = escenario(
      'GET',
      '/api/v1',
      '/accounting/ar-invoices',
    );

    await correr(interceptor, contexto, { handle: () => of({ ok: true }) });

    expect(registro.snapshot().entries).toEqual([]);
  });
});
