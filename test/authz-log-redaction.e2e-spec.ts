/**
 * P-13 · Redacción en los logs de las rutas financieras, con la aplicación completa.
 *
 * Se levanta el ERP con `LOG_LEVEL=debug` —lo máximo que un entorno puede llegar a registrar— y se
 * capturan TODAS las líneas que el proceso escribe (pino escribe por `fs.writeSync` al descriptor
 * 1; se capturan también `process.stdout`/`stderr`). Después se buscan en ellas los secretos y
 * datos personales que viajaron en la petición: el Bearer, la cookie de identidad upstream, una
 * contraseña, el correo del token y un término de búsqueda con nombre y documento de una persona.
 * Ninguno puede aparecer.
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as request from 'supertest';
import { describeWithDatabase } from './support/coverage-integration-db';
import { bootAuthzHttpApp, signAccessToken } from './support/authz-http-app';
import type { AuthzHttpApp } from './support/authz-http-app';

describeWithDatabase('P-13 redacción de logs en rutas financieras (HTTP + PostgreSQL real)', () => {
  let h: AuthzHttpApp;
  const captured: string[] = [];
  const restore: Array<() => void> = [];

  const capture = (chunk: unknown) => {
    if (typeof chunk === 'string') captured.push(chunk);
    else if (Buffer.isBuffer(chunk)) captured.push(chunk.toString('utf8'));
  };

  beforeAll(async () => {
    const originalWriteSync = fs.writeSync.bind(fs) as (...args: unknown[]) => number;
    const writeSync = jest.spyOn(fs, 'writeSync').mockImplementation(((
      fd: number,
      data: unknown,
      ...rest: unknown[]
    ) => {
      if (fd === 1 || fd === 2) {
        capture(data);
        return typeof data === 'string' ? Buffer.byteLength(data) : 0;
      }
      // Otros descriptores (la caché de transformación de Jest) siguen su camino.
      return originalWriteSync(fd, data, ...rest);
    }) as never);
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
      capture(chunk);
      return true;
    }) as never);
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
      capture(chunk);
      return true;
    }) as never);
    restore.push(
      () => writeSync.mockRestore(),
      () => stdout.mockRestore(),
      () => stderr.mockRestore(),
    );
    h = await bootAuthzHttpApp('authz_logs', { LOG_LEVEL: 'debug', NODE_ENV: 'test' });
  }, 180_000);

  afterAll(async () => {
    restore.forEach((undo) => undo());
    await h?.close();
  });

  it('ni tokens, ni cookies, ni contraseñas, ni datos personales llegan a los logs', async () => {
    const email = `persona.${randomUUID().slice(0, 8)}@atlas.test`;
    const token = signAccessToken({ sub: randomUUID(), roles: ['ADMIN'], email });
    const upstreamCookie = `cookie-upstream-${randomUUID()}`;
    const personalSearch = 'Juana Quispe CI 7654321';
    const password = `Clave-${randomUUID()}`;
    const server = h.app.getHttpServer();

    await request(server)
      .get(`/api/v1/accounting/business-partners?search=${encodeURIComponent(personalSearch)}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', `atlas_upstream_at=${upstreamCookie}`)
      .expect(200);
    await request(server)
      .get(`/api/v1/accounting/documents/${randomUUID()}?token=${encodeURIComponent(token)}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    // Un token que se RECHAZA también deja rastro en el log (el aviso del guard): tampoco ahí.
    await request(server)
      .get('/api/v1/b2b/coverage/payables')
      .set('Authorization', `Bearer ${token}x`)
      .expect(401);
    await request(server)
      .post('/api/v1/auth/password/change/request')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: password, newPassword: password });

    const logs = captured.join('');
    expect(logs.length).toBeGreaterThan(0);
    // Hubo logs de esas peticiones: la prueba no pasa en verde por silencio.
    expect(logs).toContain('/api/v1/accounting/business-partners');

    const [, , signature] = token.split('.');
    expect(logs).not.toContain(token);
    expect(logs).not.toContain(signature!);
    expect(logs).not.toContain(upstreamCookie);
    expect(logs).not.toContain(password);
    expect(logs).not.toContain(email);
    expect(logs).not.toContain('Quispe');
    expect(logs).not.toContain('7654321');
    expect(logs).not.toContain(encodeURIComponent(personalSearch));
  });
});
