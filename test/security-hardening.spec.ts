/**
 * Fija las dos fronteras que la revisión de seguridad encontró abiertas.
 *
 * No son pruebas de comportamiento de negocio: son pruebas de que una configuración
 * insegura NO arranca y de que un token emitido para un propósito no sirve para otro. Se
 * escriben como pruebas porque un comentario no impide que alguien reponga el valor por
 * omisión de antes, y estos dos defectos son precisamente del tipo que se repone sin
 * querer al resolver un conflicto.
 */
import { sign } from 'jsonwebtoken';

const originalEnv = { ...process.env };

/**
 * Aísla la prueba del `.env` del desarrollador.
 *
 * `src/config/env.ts` abre con `import 'dotenv/config'`, y `jest.resetModules()` hace que
 * eso vuelva a ejecutarse en cada importación. Sin esto, borrar una variable para
 * comprobar que su ausencia se detecta no sirve de nada: dotenv la repone desde el `.env`
 * local y la prueba pasa o falla según qué tenga configurado quien la corre.
 */
function isolateFromDotenv(): void {
  process.env.DOTENV_CONFIG_PATH = '/nonexistent/atlas-test.env';
}

/** Entorno mínimo de producción, válido salvo por lo que cada prueba rompa a propósito. */
function productionEnv(): void {
  isolateFromDotenv();
  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = 'postgres://atlas:atlas@db:5432/atlas';
  process.env.DB_SSL = 'true';
  process.env.DB_SSL_REJECT_UNAUTHORIZED = 'true';
  process.env.CORS_ALLOWED_ORIGINS = 'https://atlas.example.com';
  process.env.JWT_ACCESS_SECRET = 'production_secret_with_more_than_32_characters';
  process.env.JWT_INTERNAL_SECRET = 'production_internal_secret_more_than_32_chars';
  delete process.env.AUTH_DISABLED_FOR_LOCAL_TESTING;
}

afterEach(() => {
  jest.resetModules();
  process.env = { ...originalEnv };
});

describe('TLS de la conexión a base de datos', () => {
  it('valida el certificado por omisión cuando DB_SSL está activo', async () => {
    jest.resetModules();
    productionEnv();
    delete process.env.DB_SSL_REJECT_UNAUTHORIZED;

    const { env } = await import('../src/config/env');
    const { resolveDbSslOptions } = await import('../src/config/db-ssl');

    expect(resolveDbSslOptions(env)).toEqual({ rejectUnauthorized: true });
  });

  it('no arranca en producción con la validación del certificado desactivada', async () => {
    jest.resetModules();
    productionEnv();
    process.env.DB_SSL_REJECT_UNAUTHORIZED = 'false';

    await expect(import('../src/config/env')).rejects.toThrow(
      /DB_SSL_REJECT_UNAUTHORIZED no puede ser false en producción/,
    );
  });

  it('adjunta la CA declarada sin dejar de validar', async () => {
    jest.resetModules();
    productionEnv();
    process.env.DB_SSL_CA = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';

    const { env } = await import('../src/config/env');
    const { resolveDbSslOptions } = await import('../src/config/db-ssl');

    expect(resolveDbSslOptions(env)).toEqual({
      rejectUnauthorized: true,
      ca: process.env.DB_SSL_CA,
    });
  });

  it('devuelve false —sin TLS— sólo cuando DB_SSL está apagado', async () => {
    jest.resetModules();
    isolateFromDotenv();
    const { resolveDbSslOptions } = await import('../src/config/db-ssl');

    expect(
      resolveDbSslOptions({ DB_SSL: false, DB_SSL_REJECT_UNAUTHORIZED: true }),
    ).toBe(false);
  });
});

describe('separación de los dos planos de credencial JWT', () => {
  it('no deriva el secreto interno del de acceso: fuera de producción son distintos', async () => {
    jest.resetModules();
    isolateFromDotenv();
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'postgres://atlas:atlas@localhost:5432/atlas';
    process.env.JWT_ACCESS_SECRET = 'development_secret_with_more_than_32_chars';
    delete process.env.JWT_INTERNAL_SECRET;

    const { env } = await import('../src/config/env');

    expect(env.JWT_INTERNAL_SECRET).not.toBe(env.JWT_ACCESS_SECRET);
    expect(env.JWT_INTERNAL_SECRET.length).toBeGreaterThanOrEqual(20);
  });

  it('exige el secreto interno en producción', async () => {
    jest.resetModules();
    productionEnv();
    delete process.env.JWT_INTERNAL_SECRET;

    await expect(import('../src/config/env')).rejects.toThrow(
      /JWT_INTERNAL_SECRET es obligatorio en producción/,
    );
  });

  it('rechaza en producción que los dos secretos sean el mismo', async () => {
    jest.resetModules();
    productionEnv();
    process.env.JWT_INTERNAL_SECRET = process.env.JWT_ACCESS_SECRET;

    await expect(import('../src/config/env')).rejects.toThrow(
      /JWT_INTERNAL_SECRET debe ser distinto de JWT_ACCESS_SECRET/,
    );
  });
});

describe('JwtAuthGuard: un token vale sólo para el propósito con el que se emitió', () => {
  const secret = 'development_secret_with_more_than_32_chars';

  async function buildGuard() {
    isolateFromDotenv();
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'postgres://atlas:atlas@localhost:5432/atlas';
    process.env.JWT_ACCESS_SECRET = secret;
    process.env.JWT_ACCESS_ISSUER = 'atlas-erp';
    process.env.JWT_ACCESS_AUDIENCE = 'atlas-erp-api';
    delete process.env.AUTH_DISABLED_FOR_LOCAL_TESTING;

    const { JwtAuthGuard } = await import('../src/common/guards/jwt-auth.guard');
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    const logger = { debugContext: jest.fn(), warnContext: jest.fn() };
    return new JwtAuthGuard(reflector as never, logger as never);
  }

  function contextWith(token: string) {
    const request = {
      headers: { authorization: `Bearer ${token}` },
      method: 'GET',
      url: '/api/v1/accounting/entries',
    };
    return {
      request,
      context: {
        getHandler: () => ({ name: 'handler' }),
        getClass: () => class TestController {},
        switchToHttp: () => ({ getRequest: () => request }),
      } as never,
    };
  }

  it('acepta la sesión emitida con el emisor y la audiencia del backend', async () => {
    jest.resetModules();
    const guard = await buildGuard();
    const token = sign({ sub: 'user-1', roles: ['ADMIN'] }, secret, {
      expiresIn: '15m',
      issuer: 'atlas-erp',
      audience: 'atlas-erp-api',
    });

    const { context, request } = contextWith(token);
    expect(guard.canActivate(context)).toBe(true);
    expect((request as { user?: { sub: string } }).user?.sub).toBe('user-1');
  });

  /**
   * Éste es el defecto que se corrigió: mismo secreto, otro propósito. Antes pasaba, porque
   * la ruta de acceso comprobaba la firma y nada más.
   */
  it('rechaza un token firmado con la misma llave pero para otra audiencia', async () => {
    jest.resetModules();
    const guard = await buildGuard();
    const token = sign({ sub: 'servicio-interno', roles: ['ADMIN'] }, secret, {
      expiresIn: '15m',
      issuer: 'atlas-internal',
      audience: 'atlas-ads',
    });

    const { context } = contextWith(token);
    expect(() => guard.canActivate(context)).toThrow(/Token inválido o expirado/);
  });

  it('rechaza un token sin emisor ni audiencia', async () => {
    jest.resetModules();
    const guard = await buildGuard();
    const token = sign({ sub: 'user-1', roles: ['ADMIN'] }, secret, { expiresIn: '15m' });

    const { context } = contextWith(token);
    expect(() => guard.canActivate(context)).toThrow(/Token inválido o expirado/);
  });
});
