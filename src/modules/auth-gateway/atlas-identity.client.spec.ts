import type { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { AtlasIdentityClient } from './atlas-identity.client';

function clientReturning(body: unknown, headers: Record<string, unknown> = {}) {
  const http = { request: jest.fn().mockReturnValue(of({ data: body, headers })) };
  return new AtlasIdentityClient(http as unknown as HttpService);
}

describe('AtlasIdentityClient · desenvolver la respuesta', () => {
  it('extrae `data` del sobre de AtlasBackend', async () => {
    const client = clientReturning({ data: { id: 'u1' }, requestId: 'r1' });
    await expect(client['request']('GET', 'users/u1')).resolves.toEqual({ id: 'u1' });
  });

  it('devuelve tal cual una respuesta sin sobre', async () => {
    const client = clientReturning({ id: 'u1' });
    await expect(client['request']('GET', 'users/u1')).resolves.toEqual({ id: 'u1' });
  });

  it('tolera cuerpos vacíos o escalares', async () => {
    await expect(clientReturning(null)['request']('GET', 'x')).resolves.toBeNull();
    await expect(clientReturning('ok')['request']('GET', 'x')).resolves.toBe('ok');
  });

  it('conserva las cookies de la respuesta junto con los datos', async () => {
    const client = clientReturning({ data: { ok: true } }, { 'set-cookie': ['sid=abc; Path=/'] });
    const result = await client['requestWithCookies']('POST', 'auth/login');
    expect(result.data).toEqual({ ok: true });
    expect(result.cookies).toEqual({ sid: 'abc' });
  });

  it('manda Bearer sólo en las llamadas autenticadas', async () => {
    const http = { request: jest.fn().mockReturnValue(of({ data: { data: {} }, headers: {} })) };
    const client = new AtlasIdentityClient(http as unknown as HttpService);
    await client.me('tok');
    await client['request']('POST', 'auth/password-reset/request', { body: {} });
    const [authed, anonymous] = http.request.mock.calls.map(([c]) => c.headers);
    expect(authed.Authorization).toBe('Bearer tok');
    expect(anonymous.Authorization).toBeUndefined();
    expect(anonymous['x-atlas-product']).toBe('erp');
  });
});
