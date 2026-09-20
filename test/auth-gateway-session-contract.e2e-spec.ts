import { UnauthorizedException } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { PinoLoggerService } from '../src/common/logging/pino-logger.service';
import { AuthGatewayController } from '../src/modules/auth-gateway/auth-gateway.controller';
import { AuthGatewayService } from '../src/modules/auth-gateway/auth-gateway.service';

/**
 * Contrato HTTP de las once rutas públicas de sesión del ERP.
 *
 * Son `@Public` por diseño —un login no puede exigir sesión—, y por eso Flow Intelligence las marca
 * como escrituras sin protección y sin ninguna prueba que las nombre. Lo que las protege no es un
 * rol sino lo que fija este archivo, montado con las MISMAS tres guardas globales que `app.module`
 * (limitador, JWT, roles) y `cookie-parser`, igual que `main.ts`. Sólo se sustituye el servicio que
 * llama a AtlasBackend: aquí se prueba la frontera HTTP, no la identidad de arriba.
 *
 * Qué afirma:
 * - Las once rutas públicas se alcanzan sin token, y las dos de cambio de contraseña NO.
 * - Un cuerpo inválido se rechaza con 400 antes de llamar a AtlasBackend.
 * - Una sesión deja las dos cookies upstream `HttpOnly; SameSite=Lax` con su `Path`, y el cuerpo
 *   nunca lleva los tokens de AtlasBackend.
 * - Un desafío de PIN no deja ninguna cookie: la sesión nace en `login/pin`.
 * - Un 401 de AtlasBackend es un 401 sin cookies nuevas.
 * - Cerrar sesión borra cada cookie con SU path.
 * - El limitador global también cubre el login (tope 120/min por cliente, el de `app.module`).
 */

/**
 * Las rutas se escriben ENTERAS y no se componen con una plantilla: el derivador de Flow
 * Intelligence marca una escritura como probada cuando alguna prueba nombra su ruta literal, y
 * `/api/v1/auth/${route}` no la nombra. Componerlas dejaba el detector diciendo la verdad —nadie
 * nombra esa ruta— sobre un archivo que sí la prueba.
 */
const PUBLIC_WRITES = [
  '/api/v1/auth/login',
  '/api/v1/auth/login/pin',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
  '/api/v1/auth/merchant/login',
  '/api/v1/auth/merchant/refresh',
  '/api/v1/auth/merchant/logout',
  // Recuperar contraseña del comercio: pública por la misma razón que el login —quien la pide no
  // puede entrar—, y por eso entra en este contrato en vez de quedar fuera de toda prueba.
  '/api/v1/auth/merchant/password-reset/request',
  '/api/v1/auth/merchant/password-reset/confirm',
  // Y las mismas dos para el personal interno: rutas distintas a propósito, para que desde un
  // portal no se pueda sondear qué correos pertenecen a la otra población.
  '/api/v1/auth/password-reset/request',
  '/api/v1/auth/password-reset/confirm',
] as const;

const session = {
  accessToken: 'erp-access-token-de-prueba',
  tokenType: 'Bearer',
  expiresIn: 3600,
  user: { id: '1', email: 'persona@atlas.test', roles: ['ADMIN'] },
  upstreamAccessToken: 'upstream-access-de-prueba',
  upstreamRefreshToken: 'upstream-refresh-de-prueba',
};

const validBodies: Record<(typeof PUBLIC_WRITES)[number], object> = {
  '/api/v1/auth/login': { email: 'persona@atlas.test', password: 'una-clave' },
  '/api/v1/auth/login/pin': {
    challengeToken: 'desafio-de-mas-de-veinte-caracteres',
    pin: '123456',
  },
  '/api/v1/auth/refresh': {},
  '/api/v1/auth/logout': {},
  '/api/v1/auth/merchant/login': { email: 'comercio@atlas.test', password: 'una-clave' },
  '/api/v1/auth/merchant/refresh': {},
  '/api/v1/auth/merchant/logout': {},
  '/api/v1/auth/merchant/password-reset/request': { email: 'comercio@atlas.test' },
  '/api/v1/auth/merchant/password-reset/confirm': {
    email: 'comercio@atlas.test',
    code: '123456',
    newPassword: 'ClaveDelComercio1',
  },
  '/api/v1/auth/password-reset/request': { email: 'persona@atlas.test' },
  '/api/v1/auth/password-reset/confirm': {
    email: 'persona@atlas.test',
    code: '123456',
    newPassword: 'ClaveDelPersonal1',
  },
};

type CookieAttributes = { value: string; attributes: string[] };

function cookiesOf(response: request.Response): Map<string, CookieAttributes> {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookies = new Map<string, CookieAttributes>();
  for (const raw of header ?? []) {
    const [pair = '', ...attributes] = raw.split(';').map((part) => part.trim());
    const [name = '', ...rest] = pair.split('=');
    cookies.set(name, {
      value: rest.join('='),
      attributes: attributes.map((a) => a.toLowerCase()),
    });
  }
  return cookies;
}

async function buildApp(
  service: Partial<Record<keyof AuthGatewayService, jest.Mock>>,
  limit = 120,
) {
  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit }])],
    controllers: [AuthGatewayController],
    providers: [
      PinoLoggerService,
      { provide: AuthGatewayService, useValue: service },
      { provide: APP_GUARD, useClass: ThrottlerGuard },
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  await app.init();
  return app;
}

function fullService() {
  return {
    login: jest.fn().mockResolvedValue(session),
    loginPin: jest.fn().mockResolvedValue(session),
    refresh: jest.fn().mockResolvedValue(session),
    logout: jest.fn().mockResolvedValue({ loggedOut: true }),
    merchantLogin: jest.fn().mockResolvedValue(session),
    merchantRefresh: jest.fn().mockResolvedValue(session),
    merchantLogout: jest.fn().mockResolvedValue({ loggedOut: true }),
    requestPasswordChange: jest.fn(),
    confirmPasswordChange: jest.fn(),
    requestMerchantPasswordReset: jest.fn().mockResolvedValue({ requested: true }),
    confirmMerchantPasswordReset: jest.fn().mockResolvedValue({ passwordChanged: true }),
    requestInternalPasswordReset: jest.fn().mockResolvedValue({ requested: true }),
    confirmInternalPasswordReset: jest.fn().mockResolvedValue({ passwordChanged: true }),
  };
}

describe('Contrato HTTP de las rutas públicas de sesión del ERP', () => {
  let app: INestApplication;
  let service: ReturnType<typeof fullService>;

  beforeEach(async () => {
    service = fullService();
    app = await buildApp(service);
  });

  afterEach(async () => {
    await app.close();
  });

  it.each(PUBLIC_WRITES)('POST /%s se alcanza sin token (pública por diseño)', async (route) => {
    const response = await request(app.getHttpServer())
      .post(route)
      .set('Cookie', ['atlas_upstream_rt=refresh-previo'])
      .send(validBodies[route]);
    expect(response.status).toBeLessThan(300);
  });

  it.each(['/api/v1/auth/password/change/request', '/api/v1/auth/password/change/confirm'])(
    'POST /%s NO es pública: sin token responde 401 sin tocar AtlasBackend',
    async (route) => {
      const response = await request(app.getHttpServer()).post(route).send({});
      expect(response.status).toBe(401);
      expect(service.requestPasswordChange).not.toHaveBeenCalled();
      expect(service.confirmPasswordChange).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['/api/v1/auth/login', { email: 'no-es-un-correo', password: 'x' }, 'login'],
    ['/api/v1/auth/login', { email: 'persona@atlas.test', password: '' }, 'login'],
    ['/api/v1/auth/login/pin', { challengeToken: 'corto', pin: '123456' }, 'loginPin'],
    [
      '/api/v1/auth/login/pin',
      { challengeToken: 'desafio-de-mas-de-veinte-caracteres', pin: '12a456' },
      'loginPin',
    ],
    ['/api/v1/auth/merchant/login', { email: 'comercio@atlas.test' }, 'merchantLogin'],
    [
      '/api/v1/auth/merchant/password-reset/request',
      { email: 'no-es-un-correo' },
      'requestMerchantPasswordReset',
    ],
    // Un código de cinco dígitos o una contraseña corta se paran aquí: si llegaran arriba, el
    // código de un solo uso se gastaría y el comercio tendría que pedir otro correo.
    [
      '/api/v1/auth/merchant/password-reset/confirm',
      { email: 'comercio@atlas.test', code: '12345', newPassword: 'ClaveDelComercio1' },
      'confirmMerchantPasswordReset',
    ],
    [
      '/api/v1/auth/merchant/password-reset/confirm',
      { email: 'comercio@atlas.test', code: '123456', newPassword: 'corta123' },
      'confirmMerchantPasswordReset',
    ],
    [
      '/api/v1/auth/password-reset/request',
      { email: 'no-es-un-correo' },
      'requestInternalPasswordReset',
    ],
    [
      '/api/v1/auth/password-reset/confirm',
      { email: 'persona@atlas.test', code: '1234', newPassword: 'ClaveDelPersonal1' },
      'confirmInternalPasswordReset',
    ],
  ] as const)(
    'POST /%s con cuerpo inválido es 400 y no llama arriba',
    async (route, body, method) => {
      const response = await request(app.getHttpServer()).post(route).send(body);
      expect(response.status).toBe(400);
      expect(service[method]).not.toHaveBeenCalled();
      expect(cookiesOf(response).size).toBe(0);
    },
  );

  it.each([
    '/api/v1/auth/login',
    '/api/v1/auth/login/pin',
    '/api/v1/auth/merchant/login',
    '/api/v1/auth/refresh',
    '/api/v1/auth/merchant/refresh',
  ] as const)(
    'POST /%s deja las cookies upstream HttpOnly y SameSite=Lax con su path, y no expone sus tokens',
    async (route) => {
      const response = await request(app.getHttpServer())
        .post(route)
        .set('Cookie', ['atlas_upstream_rt=refresh-previo'])
        .send(validBodies[route]);

      const cookies = cookiesOf(response);
      const access = cookies.get('atlas_upstream_at');
      const refresh = cookies.get('atlas_upstream_rt');
      expect(access?.attributes).toEqual(
        expect.arrayContaining(['httponly', 'samesite=lax', 'path=/api/v1']),
      );
      expect(refresh?.attributes).toEqual(
        expect.arrayContaining(['httponly', 'samesite=lax', 'path=/api/v1/auth']),
      );

      const body = JSON.stringify(response.body);
      expect(body).not.toContain(session.upstreamAccessToken);
      expect(body).not.toContain(session.upstreamRefreshToken);
      expect(response.body).toMatchObject({
        accessToken: session.accessToken,
        tokenType: 'Bearer',
      });
    },
  );

  it('fuera de producción las cookies no llevan Secure (se sirve por http en local)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send(validBodies['/api/v1/auth/login']);
    for (const cookie of cookiesOf(response).values()) {
      expect(cookie.attributes).not.toContain('secure');
    }
  });

  it('un desafío de PIN no deja ninguna cookie y devuelve el desafío tal cual', async () => {
    const challenge = {
      pinChallengeRequired: true,
      challengeToken: 'desafio-opaco',
      expiresInMinutes: 10,
    };
    service.login.mockResolvedValueOnce(challenge);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send(validBodies['/api/v1/auth/login']);

    expect(response.status).toBe(201);
    expect(response.body).toEqual(challenge);
    expect(cookiesOf(response).size).toBe(0);
  });

  it.each([
    ['/api/v1/auth/login', 'login'],
    ['/api/v1/auth/login/pin', 'loginPin'],
    ['/api/v1/auth/merchant/login', 'merchantLogin'],
    ['/api/v1/auth/refresh', 'refresh'],
    ['/api/v1/auth/merchant/refresh', 'merchantRefresh'],
  ] as const)(
    'un 401 de AtlasBackend en /%s es un 401 sin cookies nuevas',
    async (route, method) => {
      service[method].mockRejectedValueOnce(new UnauthorizedException('Credenciales inválidas.'));

      const response = await request(app.getHttpServer()).post(route).send(validBodies[route]);

      expect(response.status).toBe(401);
      expect(cookiesOf(response).size).toBe(0);
    },
  );

  it.each(['/api/v1/auth/logout', '/api/v1/auth/merchant/logout'] as const)(
    'POST /%s borra cada cookie con SU path y reenvía el refresh de la cookie',
    async (route) => {
      const response = await request(app.getHttpServer())
        .post(route)
        .set('Cookie', ['atlas_upstream_rt=refresh-que-se-revoca', 'atlas_upstream_at=acceso-vivo'])
        .send({ allDevices: true });

      const cookies = cookiesOf(response);
      expect(cookies.get('atlas_upstream_at')?.attributes).toEqual(
        expect.arrayContaining(['path=/api/v1', 'expires=thu, 01 jan 1970 00:00:00 gmt']),
      );
      expect(cookies.get('atlas_upstream_rt')?.attributes).toEqual(
        expect.arrayContaining(['path=/api/v1/auth', 'expires=thu, 01 jan 1970 00:00:00 gmt']),
      );
      const method = route === '/api/v1/auth/logout' ? service.logout : service.merchantLogout;
      expect(method).toHaveBeenCalledWith('refresh-que-se-revoca', true);
    },
  );
});

describe('El limitador global también cubre el login', () => {
  it('pasado el tope por cliente, el siguiente intento es 429 y ya no llega a AtlasBackend', async () => {
    const service = fullService();
    const app = await buildApp(service, 3);
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send(validBodies['/api/v1/auth/login'])
          .expect(201);
      }
      const blocked = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(validBodies['/api/v1/auth/login']);

      expect(blocked.status).toBe(429);
      expect(service.login).toHaveBeenCalledTimes(3);
    } finally {
      await app.close();
    }
  });
});
