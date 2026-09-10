import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError, lastValueFrom, catchError } from 'rxjs';
import { HttpAccessRegistryService } from '../src/common/observability/http-access-registry.service';
import { LoggingInterceptor } from '../src/common/interceptors/logging.interceptor';

/**
 * Lo que este interceptor deja en el registro de accesos es la EVIDENCIA con la que Flujos decide si
 * una ruta del ERP está verificada o rota. Que el estado sea el de verdad no es un detalle de log:
 * un 400 contado como 500 marca BROKEN un flujo que hizo exactamente su trabajo —rechazar una
 * entrada inválida—, y nadie lo notaría, porque el cliente sí recibió su 400.
 */
function contexto(method: string, base: string, ruta: string) {
  const request = {
    method,
    baseUrl: base,
    route: { path: ruta },
    originalUrl: `${base}${ruta}`,
    url: `${base}${ruta}`,
    header: () => undefined,
    ip: '127.0.0.1',
  };
  const response = { statusCode: 200, setHeader: () => undefined };
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
}

const logger = {
  infoContext: () => undefined,
  warnContext: () => undefined,
} as never;

describe('LoggingInterceptor · lo que anota en el registro de accesos', () => {
  it('una respuesta correcta se anota con su ruta PLANTILLA, no con la URL concreta', async () => {
    const registro = new HttpAccessRegistryService();
    const interceptor = new LoggingInterceptor(logger, registro);
    const next: CallHandler = { handle: () => of({ ok: true }) };

    await lastValueFrom(
      interceptor.intercept(contexto('GET', '/api/v1', '/accounting/ar-invoices/:id'), next),
    );

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

  it.each([
    [new BadRequestException('id inválido'), 400],
    [new UnauthorizedException(), 401],
  ])(
    'un %s se anota con SU estado, no como 500: rechazar mal una entrada no es estar roto',
    async (error, esperado) => {
      const registro = new HttpAccessRegistryService();
      const interceptor = new LoggingInterceptor(logger, registro);
      const next: CallHandler = { handle: () => throwError(() => error) };

      await lastValueFrom(
        interceptor
          .intercept(contexto('GET', '/api/v1', '/accounting/ar-invoices'), next)
          .pipe(catchError(() => of(null))),
      );

      const [entrada] = registro.snapshot().entries;
      expect(entrada).toMatchObject({ lastStatus: esperado, ok: 1, failed: 0 });
    },
  );

  it('un fallo no previsto sí es un 500 y cuenta como fallido', async () => {
    const registro = new HttpAccessRegistryService();
    const interceptor = new LoggingInterceptor(logger, registro);
    const next: CallHandler = { handle: () => throwError(() => new Error('la conexión se cayó')) };

    await lastValueFrom(
      interceptor
        .intercept(contexto('GET', '/api/v1', '/accounting/ar-invoices'), next)
        .pipe(catchError(() => of(null))),
    );

    expect(registro.snapshot().entries[0]).toMatchObject({ lastStatus: 500, ok: 0, failed: 1 });
  });
});
