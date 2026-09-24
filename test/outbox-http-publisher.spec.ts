/**
 * Adaptador HTTP firmado del outbox (P-03): firma, clasificación de respuestas, timeouts y
 * redacción. Sin base de datos; el timeout y la red caída se prueban contra sockets reales.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  OUTBOX_ENVELOPE_SPEC,
  type OutboxEnvelope,
} from '../src/workers/outbox/event-publisher.port';
import {
  ATTEMPT_HEADER,
  EVENT_KEY_HEADER,
  HttpEventPublisher,
  SIGNATURE_HEADER,
  redactDeliveryError,
  signOutboxBody,
  verifyOutboxSignature,
} from '../src/workers/outbox/http-event-publisher';
import { OutboxRelay, computeBackoffMs } from '../src/workers/outbox/outbox-relay';
import { ROLES_KEY } from '../src/common/decorators/roles.decorator';
import { OutboxOperationsController } from '../src/modules/accounting/outbox/outbox-operations.controller';
import { replayOutboxEventSchema } from '../src/modules/accounting/outbox/outbox-operations.schemas';

const SECRET = 'secreto-de-prueba-de-al-menos-32-caracteres';
const envelope: OutboxEnvelope = {
  spec: OUTBOX_ENVELOPE_SPEC,
  eventKey: 'doc-posted-1',
  topic: 'accounting.document.posted',
  schemaVersion: 1,
  aggregate: {
    type: 'accounting_document',
    id: '00000000-0000-4000-8000-000000000001',
    version: 3,
  },
  occurredAt: '2026-09-24T10:00:00.000Z',
  producer: 'atlas-erp',
  payload: { amount: '100.00' },
};

type Captured = { url: string; init: RequestInit };

function publisherAnswering(status: number, captured: Captured[] = []): HttpEventPublisher {
  return new HttpEventPublisher({
    url: 'http://receptor.interno/eventos',
    signingSecret: SECRET,
    timeoutMs: 1_000,
    nowSeconds: () => 1_790_000_000,
    fetchImpl: async (url, init) => {
      captured.push({ url, init });
      return new Response(status === 204 ? null : 'cuerpo-con-datos', { status });
    },
  });
}

describe('firma HMAC del outbox', () => {
  const body = JSON.stringify(envelope);
  const header = signOutboxBody(SECRET, body, 1_790_000_000);

  it('el receptor verifica la firma con el secreto y el cuerpo crudo', () => {
    expect(header).toMatch(/^t=1790000000,v1=[0-9a-f]{64}$/);
    expect(
      verifyOutboxSignature({ secret: SECRET, header, rawBody: body, nowSeconds: 1_790_000_010 }),
    ).toBe(true);
  });

  it('rechaza cuerpo alterado, otro secreto, firma ausente o fuera de ventana', () => {
    const now = 1_790_000_010;
    expect(
      verifyOutboxSignature({
        secret: SECRET,
        header,
        rawBody: body.replace('100.00', '900.00'),
        nowSeconds: now,
      }),
    ).toBe(false);
    expect(
      verifyOutboxSignature({ secret: `${SECRET}x`, header, rawBody: body, nowSeconds: now }),
    ).toBe(false);
    expect(
      verifyOutboxSignature({ secret: SECRET, header: undefined, rawBody: body, nowSeconds: now }),
    ).toBe(false);
    expect(
      verifyOutboxSignature({
        secret: SECRET,
        header: 't=abc,v1=zz',
        rawBody: body,
        nowSeconds: now,
      }),
    ).toBe(false);
    expect(
      verifyOutboxSignature({
        secret: SECRET,
        header,
        rawBody: body,
        nowSeconds: 1_790_000_000 + 301,
      }),
    ).toBe(false);
  });
});

describe('HttpEventPublisher: clasificación de la respuesta', () => {
  it('2xx es ACK y envía firma, clave, intento y sólo las cabeceras W3C de traza', async () => {
    const captured: Captured[] = [];
    const result = await publisherAnswering(204, captured).publish(envelope, {
      attempt: 4,
      traceHeaders: {
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
        [SIGNATURE_HEADER]: 'intento-de-pisar-la-firma',
        baggage: 'x=1',
      },
    });

    expect(result).toEqual({ outcome: 'ACK', httpStatus: 204 });
    const headers = captured[0]!.init.headers as Record<string, string>;
    expect(headers[EVENT_KEY_HEADER]).toBe('doc-posted-1');
    expect(headers[ATTEMPT_HEADER]).toBe('4');
    expect(headers.traceparent).toMatch(/^00-0af7/);
    expect(headers.baggage).toBeUndefined();
    const body = captured[0]!.init.body as string;
    expect(
      verifyOutboxSignature({
        secret: SECRET,
        header: headers[SIGNATURE_HEADER],
        rawBody: body,
        nowSeconds: 1_790_000_000,
      }),
    ).toBe(true);
    expect(JSON.parse(body)).toEqual(envelope);
    expect(captured[0]!.init.redirect).toBe('manual');
  });

  it.each([500, 502, 503, 408, 429, 401, 403, 404, 302])(
    '%i es transitorio: RETRY',
    async (status) => {
      const result = await publisherAnswering(status).publish(envelope, {
        attempt: 1,
        traceHeaders: {},
      });
      expect(result).toEqual({
        outcome: 'RETRY',
        error: `HTTP ${status} del receptor`,
        httpStatus: status,
      });
    },
  );

  it.each([400, 410, 413, 415, 422])('%i es definitivo: REJECTED', async (status) => {
    const result = await publisherAnswering(status).publish(envelope, {
      attempt: 1,
      traceHeaders: {},
    });
    expect(result.outcome).toBe('REJECTED');
    expect(result).not.toHaveProperty('error', expect.stringContaining('cuerpo-con-datos'));
  });
});

describe('HttpEventPublisher: red real', () => {
  let server: Server;
  let url: string;

  beforeAll(async () => {
    // Acepta y nunca responde.
    server = createServer(() => undefined);
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/eventos`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((ok) => server.close(() => ok()));
  });

  it('un receptor que no contesta a tiempo es RETRY por timeout, no ACK', async () => {
    const publisher = new HttpEventPublisher({ url, signingSecret: SECRET, timeoutMs: 150 });
    const started = Date.now();
    const result = await publisher.publish(envelope, { attempt: 1, traceHeaders: {} });
    expect(result).toEqual({
      outcome: 'RETRY',
      error: 'timeout: sin respuesta del receptor en 150 ms',
      httpStatus: null,
    });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('un receptor caído (conexión rechazada) es RETRY sin filtrar el secreto', async () => {
    const closed = createServer();
    await new Promise<void>((ok) => closed.listen(0, '127.0.0.1', ok));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>((ok) => closed.close(() => ok()));

    const publisher = new HttpEventPublisher({
      url: `http://usuario:clave@127.0.0.1:${port}/eventos?token=abc`,
      signingSecret: SECRET,
      timeoutMs: 1_000,
    });
    const result = await publisher.publish(envelope, { attempt: 1, traceHeaders: {} });
    expect(result.outcome).toBe('RETRY');
    if (result.outcome === 'RETRY') {
      expect(result.error).toMatch(/^red: /);
      expect(result.error).not.toContain(SECRET);
      expect(result.error).not.toContain('clave');
    }
  });
});

describe('redacción y backoff', () => {
  it('redactDeliveryError quita credenciales de URL, query, secreto y firma, y trunca', () => {
    const redacted = redactDeliveryError(
      `falló https://u:p@host.interno/ruta?token=zzz con ${SECRET} x-atlas-signature=t=1,v1=abc ${'x'.repeat(400)}`,
      SECRET,
    );
    expect(redacted).toContain('https://host.interno/…');
    expect(redacted).not.toContain('u:p@');
    expect(redacted).not.toContain('token=zzz');
    expect(redacted).not.toContain(SECRET);
    expect(redacted).not.toContain('v1=abc');
    expect(redacted.length).toBeLessThanOrEqual(300);
  });

  it('backoff exponencial con tope', () => {
    expect([1, 2, 3, 4, 5].map((a) => computeBackoffMs(a, 5_000, 30_000))).toEqual([
      5_000, 10_000, 20_000, 30_000, 30_000,
    ]);
    expect(computeBackoffMs(1_000, 5_000, 3_600_000)).toBe(3_600_000);
  });

  it('sin transporte el relay no toca la base: no reserva ni marca', async () => {
    const query = jest.fn();
    const relay = new OutboxRelay(
      { query },
      null,
      {
        batchSize: 10,
        leaseMs: 60_000,
        maxAttempts: 3,
        retryBaseMs: 1_000,
        retryMaxMs: 10_000,
      },
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    );
    const summary = await relay.runOnce();
    expect(summary.transportConfigured).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('rutas de operación del outbox', () => {
  it('sólo administración y finanzas', () => {
    expect(Reflect.getMetadata(ROLES_KEY, OutboxOperationsController)).toEqual([
      'ADMIN',
      'CFO',
      'FINANCE',
    ]);
  });

  it('el replay exige un motivo revisable', () => {
    expect(replayOutboxEventSchema.safeParse({ reason: 'corto' }).success).toBe(false);
    expect(
      replayOutboxEventSchema.safeParse({ reason: 'Receptor restaurado tras incidente INC-12' })
        .success,
    ).toBe(true);
  });
});
