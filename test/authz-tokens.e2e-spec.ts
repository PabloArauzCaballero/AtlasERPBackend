/**
 * P-13 · Tokens y cabeceras manipuladas contra la aplicación completa (HTTP + PostgreSQL real).
 *
 * Modo de autenticación REAL del ERP (`JwtAuthGuard`): verificación LOCAL de un JWT HS256 en dos
 * planos —acceso de personas (`JWT_ACCESS_*`) y servicio a servicio (`JWT_INTERNAL_*`)—, sin
 * verificador remoto ni lista de revocación. Por eso lo que aquí se prueba es: firma, algoritmo,
 * emisor, audiencia, caducidad, forma del payload, cruce de planos, que el plano de servicio no
 * pueda declararse roles de persona, y que ninguna cabecera o cookie sustituya a lo firmado.
 * La revocación de un comercio vive en su membresía (`authz-merchant.e2e-spec.ts`).
 *
 * Ninguna respuesta de error puede devolver el token ni datos del recurso.
 */
import { randomUUID } from 'node:crypto';
import { sign } from 'jsonwebtoken';
import * as request from 'supertest';
import { describeWithDatabase } from './support/coverage-integration-db';
import {
  ACCESS_AUDIENCE,
  ACCESS_ISSUER,
  ACCESS_SECRET,
  bootAuthzHttpApp,
  signAccessToken,
} from './support/authz-http-app';
import type { AuthzHttpApp } from './support/authz-http-app';
import { seedLegalEntityWorld, seedSharedAccounting } from './support/authz-fixtures';
import type { LegalEntityWorld } from './support/authz-fixtures';

const INTERNAL_SECRET = 'p13_internal_secret_with_more_than_32_chars';
const INTERNAL_ISSUER = 'atlas-internal';
const INTERNAL_AUDIENCE = 'atlas-ads';

describeWithDatabase('P-13 tokens y cabeceras (HTTP + PostgreSQL real)', () => {
  let h: AuthzHttpApp;
  let A: LegalEntityWorld;
  let B: LegalEntityWorld;
  let docA: string;

  const api = () => request(h.app.getHttpServer());

  beforeAll(async () => {
    h = await bootAuthzHttpApp('authz_tokens', { JWT_INTERNAL_SECRET: INTERNAL_SECRET });
    const shared = await seedSharedAccounting(h.sql);
    A = await seedLegalEntityWorld(h.sql, shared, 'A');
    B = await seedLegalEntityWorld(h.sql, shared, 'B');
    docA = `/api/v1/accounting/documents/${A.documentId}`;
  }, 180_000);

  afterAll(async () => {
    await h?.close();
  });

  const accountantA = { sub: randomUUID(), roles: ['ACCOUNTANT'], legalEntityIds: [] as string[] };
  beforeAll(() => {
    accountantA.legalEntityIds = [A.legalEntityId];
  });

  const expect401 = async (authorization: string | undefined) => {
    const call = api().get(docA);
    if (authorization !== undefined) call.set('Authorization', authorization);
    const res = await call.expect(401);
    expect(res.body.success).toBe(false);
    if (authorization) expect(JSON.stringify(res.body)).not.toContain(authorization.slice(-20));
    expect(JSON.stringify(res.body)).not.toContain(A.documentId);
  };

  describe('credencial ausente o mal formada', () => {
    it('sin cabecera Authorization responde 401', async () => {
      await expect401(undefined);
    });

    it.each([
      ['esquema Basic', 'Basic dXNlcjpwYXNz'],
      ['Bearer sin token', 'Bearer '],
      ['token que no es JWT', 'Bearer no-es-un-jwt'],
      ['dos tokens', 'Bearer a.b.c d.e.f'],
    ])('%s responde 401', async (_caso, header) => {
      await expect401(header);
    });

    it('la cookie de identidad upstream NO sustituye al Bearer', async () => {
      await api().get(docA).set('Cookie', 'atlas_upstream_at=cualquier-cosa').expect(401);
    });
  });

  describe('token firmado pero inválido', () => {
    const base = () => ({ ...accountantA, roleCode: 'ACCOUNTANT' });

    it('token vencido responde 401', async () => {
      const token = sign({ ...base(), exp: Math.floor(Date.now() / 1000) - 60 }, ACCESS_SECRET(), {
        issuer: ACCESS_ISSUER,
        audience: ACCESS_AUDIENCE,
      });
      await expect401(`Bearer ${token}`);
    });

    it('token todavía no válido (nbf futuro) responde 401', async () => {
      await expect401(`Bearer ${signAccessToken(accountantA, { notBefore: '5m' })}`);
    });

    it('firma con otra llave responde 401', async () => {
      const token = sign(base(), 'otra_llave_distinta_de_mas_de_32_caracteres', {
        issuer: ACCESS_ISSUER,
        audience: ACCESS_AUDIENCE,
        expiresIn: '5m',
      });
      await expect401(`Bearer ${token}`);
    });

    it('emisor incorrecto responde 401', async () => {
      await expect401(`Bearer ${signAccessToken(accountantA, { issuer: 'otro-emisor' })}`);
    });

    it('audiencia incorrecta responde 401', async () => {
      await expect401(`Bearer ${signAccessToken(accountantA, { audience: 'otra-api' })}`);
    });

    it('algoritmo distinto de HS256 con la llave correcta responde 401', async () => {
      await expect401(`Bearer ${signAccessToken(accountantA, { algorithm: 'HS512' })}`);
    });

    it('alg=none sin firma responde 401', async () => {
      const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const now = Math.floor(Date.now() / 1000);
      const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
        ...base(),
        roles: ['ADMIN'],
        iss: ACCESS_ISSUER,
        aud: ACCESS_AUDIENCE,
        iat: now,
        exp: now + 300,
      })}.`;
      await expect401(`Bearer ${unsigned}`);
    });

    it('payload manipulado (roles cambiados tras firmar) responde 401', async () => {
      const [header, payload, signature] = signAccessToken(accountantA).split('.');
      const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'));
      claims.roles = ['ADMIN'];
      const forged = Buffer.from(JSON.stringify(claims)).toString('base64url');
      await expect401(`Bearer ${header}.${forged}.${signature}`);
    });

    it('token sin sub o sin roles responde 401', async () => {
      await expect401(
        `Bearer ${sign({ roles: ['ACCOUNTANT'] }, ACCESS_SECRET(), {
          issuer: ACCESS_ISSUER,
          audience: ACCESS_AUDIENCE,
          expiresIn: '5m',
        })}`,
      );
      await expect401(
        `Bearer ${sign({ sub: randomUUID(), roles: [] }, ACCESS_SECRET(), {
          issuer: ACCESS_ISSUER,
          audience: ACCESS_AUDIENCE,
          expiresIn: '5m',
        })}`,
      );
    });
  });

  describe('planos de credencial (persona vs. servicio)', () => {
    const internalToken = (roles: string[], secret = INTERNAL_SECRET) =>
      sign({ sub: `svc-${randomUUID()}`, roles, tokenType: 'service_access' }, secret, {
        algorithm: 'HS256',
        issuer: INTERNAL_ISSUER,
        audience: INTERNAL_AUDIENCE,
        expiresIn: '5m',
      });

    it('un token de servicio NO puede declararse ADMIN: 401 en la contabilidad', async () => {
      await expect401(`Bearer ${internalToken(['ADMIN'])}`);
    });

    it('un token de servicio NO puede declararse FINANCE ni MERCHANT_ADMIN', async () => {
      await api()
        .get('/api/v1/b2b/coverage/payables')
        .set('Authorization', `Bearer ${internalToken(['FINANCE'])}`)
        .expect(401);
      await api()
        .get('/api/v1/portal/scope')
        .set('Authorization', `Bearer ${internalToken(['MERCHANT_ADMIN'])}`)
        .expect(401);
    });

    it('un token de servicio con su rol técnico (ADS_EVENT_TRACKER) no alcanza rutas financieras', async () => {
      await api()
        .get(docA)
        .set('Authorization', `Bearer ${internalToken(['ADS_EVENT_TRACKER'])}`)
        .expect(403);
      await api()
        .get('/api/v1/accounting/outbox/status')
        .set('Authorization', `Bearer ${internalToken(['ADS_EVENT_TRACKER'])}`)
        .expect(403);
    });

    it('un token de servicio con su rol técnico sí pasa la autenticación de su ruta (prueba positiva)', async () => {
      const res = await api()
        .post('/api/v1/ads/events')
        .set('Authorization', `Bearer ${internalToken(['ADS_EVENT_TRACKER'])}`)
        .send({});
      expect([400, 422]).toContain(res.status);
    });

    it('un token de persona firmado con la llave de servicio no vale en el plano de acceso', async () => {
      const token = sign({ ...accountantA, roleCode: 'ACCOUNTANT' }, INTERNAL_SECRET, {
        issuer: ACCESS_ISSUER,
        audience: ACCESS_AUDIENCE,
        expiresIn: '5m',
      });
      await expect401(`Bearer ${token}`);
    });

    it('un token de servicio firmado con la llave de acceso no vale en el plano interno', async () => {
      await expect401(`Bearer ${internalToken(['ADS_EVENT_TRACKER'], ACCESS_SECRET())}`);
    });

    it('el manifiesto de plataforma exige su propia llave: sin ella no responde el catálogo', async () => {
      const res = await api()
        .get('/api/v1/platform/catalog-manifest')
        .set('x-platform-catalog-key', 'llave-inventada-de-mas-de-veinte');
      expect([401, 503]).toContain(res.status);
    });
  });

  describe('cabeceras manipuladas', () => {
    it.each([
      ['x-legal-entity-id', () => B.legalEntityId],
      ['x-tenant-id', () => B.legalEntityId],
      ['x-user-id', () => randomUUID()],
      ['x-roles', () => 'ADMIN'],
      ['x-merchant-account-id', () => randomUUID()],
      ['x-forwarded-user', () => 'admin@atlas.test'],
    ])(
      'la cabecera %s no amplía el alcance del token: el documento de B sigue en 403',
      async (header, value) => {
        await api()
          .get(`/api/v1/accounting/documents/${B.documentId}`)
          .set('Authorization', `Bearer ${signAccessToken(accountantA)}`)
          .set(header, value())
          .expect(403);
      },
    );

    it('un sub y roles de otro usuario en la consulta no cambian la identidad', async () => {
      await api()
        .get(`/api/v1/accounting/documents/${B.documentId}?sub=${randomUUID()}&roles=ADMIN`)
        .set('Authorization', `Bearer ${signAccessToken(accountantA)}`)
        .expect(403);
    });

    it('el token válido del contable de A lee su documento (prueba positiva)', async () => {
      await api()
        .get(docA)
        .set('Authorization', `Bearer ${signAccessToken(accountantA)}`)
        .expect(200);
    });
  });
});
