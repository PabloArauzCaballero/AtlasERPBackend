import { of, lastValueFrom } from 'rxjs';
import type { ExecutionContext } from '@nestjs/common';
import { buildCorsOptions } from '../src/config/cors.config';
import { LoggingInterceptor } from '../src/common/interceptors/logging.interceptor';
import { HttpAccessRegistryService } from '../src/common/observability/http-access-registry.service';
import { requestOrigin } from '../src/common/observability/request-origin';

/**
 * Las 71 pantallas del portal del ERP no tenían forma de verificarse: el portal sólo llama a este
 * backend, y este backend no guardaba desde dónde se le llamaba. Ahora cuenta por pantalla, y
 * AtlasBackend lo cruza con su catálogo. Lo que se protege es que ese cruce no dé cero en silencio.
 */
const cabeceras = (valores: Record<string, string>) => (nombre: string) =>
  valores[nombre.toLowerCase()];

describe('requestOrigin · mismas reglas que AtlasBackend', () => {
  it('normaliza el cliente al código del catálogo de pantallas', () => {
    expect(
      requestOrigin(
        cabeceras({ 'x-atlas-flow': '/operaciones/clientes/42', 'x-atlas-product': 'erp-portal' }),
      ),
    ).toEqual({
      client: 'ERP_PORTAL',
      screen: '/operaciones/clientes/42',
    });
  });

  it('sin cliente no se atribuye: `/` es una pantalla distinta en cada portal', () => {
    expect(requestOrigin(cabeceras({ 'x-atlas-flow': '/' }))).toBeNull();
  });

  it('lo que no encaja se descarta, no se sanea', () => {
    expect(
      requestOrigin(cabeceras({ 'x-atlas-flow': '/a b', 'x-atlas-product': 'erp-portal' })),
    ).toBeNull();
    expect(
      requestOrigin(cabeceras({ 'x-atlas-flow': 'sin-barra', 'x-atlas-product': 'erp-portal' })),
    ).toBeNull();
    expect(
      requestOrigin(cabeceras({ 'x-atlas-flow': '/a', 'x-atlas-product': 'erp portal' })),
    ).toBeNull();
  });
});

describe('HttpAccessRegistryService · pantallas', () => {
  const origen = { client: 'ERP_PORTAL', screen: '/operaciones/clientes/42' };

  it('cuenta llamadas y rutas por pantalla, y sólo el 5xx como fallo', () => {
    const registro = new HttpAccessRegistryService();
    registro.record('GET', '/api/v1/customers/:id', 200, origen);
    registro.record('GET', '/api/v1/customers/:id', 404, origen);
    registro.record('POST', '/api/v1/customers/:id/notes', 500, origen);
    const [pantalla] = registro.snapshot().screens;
    expect(pantalla).toMatchObject({
      client: 'ERP_PORTAL',
      screen: '/operaciones/clientes/42',
      calls: 3,
      failed: 1,
    });
    expect(pantalla?.routes).toEqual([
      { method: 'GET', path: '/api/v1/customers/:id', calls: 2, failed: 0 },
      { method: 'POST', path: '/api/v1/customers/:id/notes', calls: 1, failed: 1 },
    ]);
  });

  it('sin origen se cuenta la ruta y no se inventa una pantalla', () => {
    const registro = new HttpAccessRegistryService();
    registro.record('GET', '/api/v1/health', 200);
    expect(registro.snapshot()).toMatchObject({ screens: [], screensTruncated: false });
    expect(registro.snapshot().entries).toHaveLength(1);
  });

  it('más de 40 rutas en una pantalla: se deja de anotar y se DICE', () => {
    const registro = new HttpAccessRegistryService();
    for (let i = 0; i < 41; i += 1) registro.record('GET', `/api/v1/r/${i}`, 200, origen);
    const [pantalla] = registro.snapshot().screens;
    expect(pantalla?.routes).toHaveLength(40);
    expect(pantalla?.routesTruncated).toBe(true);
  });

  it('al tope deja de anotar pantallas nuevas y lo DICE', () => {
    const registro = new HttpAccessRegistryService();
    for (let i = 0; i <= 2000; i += 1)
      registro.record('GET', '/api/v1/x', 200, { client: 'ERP_PORTAL', screen: `/p/${i}` });
    const { screens, screensTruncated } = registro.snapshot();
    expect(screens).toHaveLength(2000);
    expect(screensTruncated).toBe(true);
  });
});

describe('LoggingInterceptor · anota la pantalla que declara la petición', () => {
  async function pasar(conUsuario: boolean) {
    const valores: Record<string, string> = {
      'x-atlas-flow': '/operaciones/cartera',
      'x-atlas-product': 'erp-portal',
    };
    const request: Record<string, unknown> = {
      method: 'GET',
      baseUrl: '/api/v1',
      route: { path: '/health' },
      originalUrl: '/api/v1/health',
      url: '/api/v1/health',
      header: (nombre: string) => valores[nombre.toLowerCase()],
      ...(conUsuario ? { user: { sub: 'u1' } } : {}),
    };
    const oyentes: Array<() => void> = [];
    const response = {
      statusCode: 200,
      setHeader: () => undefined,
      once: (_: string, fn: () => void) => oyentes.push(fn),
    };
    const contexto = {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    } as unknown as ExecutionContext;
    const registro = new HttpAccessRegistryService();
    const logger = { infoContext: () => undefined, warnContext: () => undefined } as never;
    await lastValueFrom(
      new LoggingInterceptor(logger, registro).intercept(contexto, { handle: () => of(null) }),
    );
    oyentes.forEach((fn) => fn());
    return registro.snapshot();
  }

  it('una llamada anónima no anota pantalla: no se puede llenar el tope desde una ruta pública', async () => {
    const snapshot = await pasar(false);
    expect(snapshot.screens).toEqual([]);
    expect(snapshot.entries).toHaveLength(1);
  });

  it('con usuario sí se anota', async () => {
    expect((await pasar(true)).screens).toHaveLength(1);
  });

  it('lee x-atlas-flow y x-atlas-product de la petición real', async () => {
    const valores: Record<string, string> = {
      'x-atlas-flow': '/operaciones/cartera',
      'x-atlas-product': 'erp-portal',
    };
    const request = {
      method: 'GET',
      baseUrl: '/api/v1',
      route: { path: '/portfolio' },
      originalUrl: '/api/v1/portfolio',
      url: '/api/v1/portfolio',
      header: (nombre: string) => valores[nombre.toLowerCase()],
      user: { sub: 'u1' },
    };
    const oyentes: Array<() => void> = [];
    const response = {
      statusCode: 200,
      setHeader: () => undefined,
      once: (_: string, fn: () => void) => oyentes.push(fn),
    };
    const contexto = {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    } as unknown as ExecutionContext;
    const registro = new HttpAccessRegistryService();
    const logger = { infoContext: () => undefined, warnContext: () => undefined } as never;

    await lastValueFrom(
      new LoggingInterceptor(logger, registro).intercept(contexto, { handle: () => of(null) }),
    );
    oyentes.forEach((fn) => fn());

    expect(registro.snapshot().screens).toEqual([
      expect.objectContaining({ client: 'ERP_PORTAL', screen: '/operaciones/cartera', calls: 1 }),
    ]);
  });
});

describe('CORS · las cabeceras propias del portal pasan el preflight', () => {
  it('permite PUT: hay rutas PUT y el preflight lo rechazaba', () => {
    expect(buildCorsOptions().methods).toEqual(expect.arrayContaining(['PUT']));
  });

  it('permite la correlación y el origen de pantalla', () => {
    expect(buildCorsOptions().allowedHeaders).toEqual(
      expect.arrayContaining([
        'X-Correlation-Id',
        'X-Atlas-Flow',
        'X-Atlas-Product',
        'X-Idempotency-Key',
      ]),
    );
  });
});
