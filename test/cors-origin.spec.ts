/**
 * Un origen desconocido NO puede tumbar la petición.
 *
 * El 2026-09-21, con los dominios propios de TEST recién publicados, `buildCorsOptions` llamaba al
 * callback con un `Error`. Eso no «bloquea el CORS»: revienta la petición entera con 500
 * «CORS origin not allowed». Como el ERP se sirve por el rewrite de Next —que reenvía `Origin` tal
 * cual—, `POST /api/v1/auth/login` por el dominio nuevo devolvía 500 en vez de 401, y el ERP entero
 * quedaba sin poder guardar nada. La pantalla cargaba igual porque un GET del mismo origen no manda
 * `Origin`, así que el fallo sólo aparecía al escribir.
 */
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

type ComprobadorDeOrigen = Extract<CorsOptions['origin'], (...args: never[]) => unknown>;
/** Lo que el callback de `cors` admite como «permitido»: no es sólo un booleano. */
type Permitido = Parameters<Parameters<ComprobadorDeOrigen>[1]>[1];

const originalEnv = { ...process.env };

/** Carga `buildCorsOptions` con la lista de orígenes dada, sin arrastrar el módulo ya evaluado. */
async function comprobadorCon(origenes: string): Promise<ComprobadorDeOrigen> {
  jest.resetModules();
  process.env.CORS_ALLOWED_ORIGINS = origenes;
  const { buildCorsOptions } = await import('../src/config/cors.config');
  const { origin } = buildCorsOptions();
  if (typeof origin !== 'function') {
    throw new Error('buildCorsOptions debe resolver el origen con una función.');
  }
  return origin as ComprobadorDeOrigen;
}

/** Ejecuta el callback y devuelve lo que le llega: `[error, permitido]`. */
function decidir(
  comprobador: ComprobadorDeOrigen,
  origen: string | undefined,
): [Error | null, Permitido] {
  let recibido: [Error | null, Permitido] = [null, undefined];
  comprobador(origen as string, (error, permitido) => {
    recibido = [error ?? null, permitido];
  });
  return recibido;
}

afterEach(() => {
  process.env = { ...originalEnv };
  jest.resetModules();
});

describe('CORS del ERP', () => {
  it('permite un origen declarado', async () => {
    const comprobador = await comprobadorCon('https://atlas.erp.test.arauzsoftware.com');

    expect(decidir(comprobador, 'https://atlas.erp.test.arauzsoftware.com')).toEqual([null, true]);
  });

  it('permite la petición sin Origin (servidor a servidor, curl, sondas de salud)', async () => {
    const comprobador = await comprobadorCon('https://atlas.erp.test.arauzsoftware.com');

    expect(decidir(comprobador, undefined)).toEqual([null, true]);
  });

  it('niega un origen desconocido SIN fallar la petición', async () => {
    const comprobador = await comprobadorCon('https://atlas.erp.test.arauzsoftware.com');

    const [error, permitido] = decidir(comprobador, 'https://atacante.example.com');

    // Lo que importa: `error` null. Con un Error aquí, la respuesta es 500 y no la que tocaba.
    expect(error).toBeNull();
    expect(permitido).toBe(false);
  });

  it('ignora la barra final, que en un origen nunca casa', async () => {
    const comprobador = await comprobadorCon('https://atlas.erp.test.arauzsoftware.com/');

    expect(decidir(comprobador, 'https://atlas.erp.test.arauzsoftware.com')).toEqual([null, true]);
  });

  it('respeta esquema y puerto: no basta con que coincida el host', async () => {
    const comprobador = await comprobadorCon('https://atlas.erp.test.arauzsoftware.com');

    expect(decidir(comprobador, 'http://atlas.erp.test.arauzsoftware.com')[1]).toBe(false);
    expect(decidir(comprobador, 'https://atlas.erp.test.arauzsoftware.com:8443')[1]).toBe(false);
  });
});
