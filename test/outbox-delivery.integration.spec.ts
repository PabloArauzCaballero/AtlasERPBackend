/**
 * Entrega real del outbox del ERP y consumo idempotente (P-03 · B05), contra PostgreSQL de verdad.
 *
 * Cada ejecución crea una base NUEVA en el servidor indicado, le aplica la lista canónica de
 * migraciones (`STARTUP_MIGRATION_FILES`, la misma del arranque y de `db:migrate:prod`) y la borra
 * al terminar. El receptor es un servidor HTTP real en 127.0.0.1 que verifica la firma y aplica
 * el efecto con la inbox (`consumeOnce`) en la misma transacción que registra la clave.
 *
 *   ATLAS_OUTBOX_IT_DATABASE_URL=postgres://postgres:pass@127.0.0.1:5432/postgres \
 *     npx jest test/outbox-delivery.integration.spec.ts
 *
 * Sin la variable la suite se SALTA y lo dice: no hay doble en memoria que pueda afirmar que dos
 * workers no toman el mismo evento o que la unicidad de la inbox aguanta diez reenvíos.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { Client, Pool } from 'pg';
import { Sequelize } from 'sequelize-typescript';
import { MIGRATION_SEARCH_PATH, STARTUP_MIGRATION_FILES } from '../src/database/startup-migrations';
import { EventOutboxModel } from '../src/database/models/event_outbox.model';
import { consumeOnce, type InboxOrdering } from '../src/common/events/event-inbox';
import { inPgTransaction } from '../src/common/events/queryable';
import type { OutboxEnvelope, PublishResult } from '../src/workers/outbox/event-publisher.port';
import {
  HttpEventPublisher,
  SIGNATURE_HEADER,
  verifyOutboxSignature,
} from '../src/workers/outbox/http-event-publisher';
import {
  OutboxRelay,
  toEnvelope,
  type OutboxRelayConfig,
} from '../src/workers/outbox/outbox-relay';
import {
  listDeadEvents,
  readOutboxStatus,
  replayEvent,
} from '../src/workers/outbox/outbox-operations';
import { createOtelDeliveryTracer } from '../src/workers/outbox/outbox-tracing';
import { MessagingTraceService } from '../src/common/observability/messaging-trace.service';
import { TracingService } from '../src/common/observability/tracing.service';
import {
  installInMemoryTracing,
  type TracingHarness,
} from '../src/common/observability/__pruebas__/support/in-memory-tracing';

const SERVER_URL = process.env.ATLAS_OUTBOX_IT_DATABASE_URL ?? process.env.ATLAS_IT_DATABASE_URL;
const describeIfDb = SERVER_URL ? describe : describe.skip;
if (!SERVER_URL) {
  // Visible en la salida de jest: una suite saltada no es una suite verde.
  console.warn(
    '[outbox-delivery] SALTADA: define ATLAS_OUTBOX_IT_DATABASE_URL (servidor PostgreSQL) para ejecutarla.',
  );
}

jest.setTimeout(60_000);

const SECRET = 'secreto-de-prueba-de-al-menos-32-caracteres';
const CONSUMER = 'it-receptor';
const LEGACY_KEY = 'legacy-log-only-1';
const silentLogger = { info: () => undefined, warn: () => undefined, error: () => undefined };

type ReceiverMode = 'ok' | 'fail503' | 'slow-after-commit' | 'reject422';

interface Receiver {
  url: string;
  mode: ReceiverMode;
  ordering: InboxOrdering;
  /** Cada petición que llegó por la red, en orden de llegada. */
  wire: { eventKey: string; version: number; attempt: string; traceparent?: string }[];
  results: string[];
  close(): Promise<void>;
}

let admin: Client;
let dbName: string;
let dbUrl: string;
let pool: Pool;
let db: Client;
let receiver: Receiver;
let harness: TracingHarness;

function urlFor(database: string): string {
  const url = new URL(SERVER_URL!);
  url.pathname = `/${database}`;
  return url.toString();
}

async function applyMigrations(client: Client, files: readonly string[]): Promise<void> {
  for (const file of files) {
    await inPgTransaction(client, async (tx) => {
      await tx.query(`SET LOCAL search_path TO ${MIGRATION_SEARCH_PATH}`);
      await tx.query(readFileSync(resolve(__dirname, '..', file), 'utf8'));
    });
  }
}

async function startReceiver(): Promise<Receiver> {
  const state: Omit<Receiver, 'url' | 'close'> = {
    mode: 'ok',
    ordering: 'every-event',
    wire: [],
    results: [],
  };
  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const signature = req.headers[SIGNATURE_HEADER];
    if (!verifyOutboxSignature({ secret: SECRET, header: String(signature), rawBody })) {
      res.writeHead(401).end();
      return;
    }
    const envelope = JSON.parse(rawBody) as OutboxEnvelope;
    state.wire.push({
      eventKey: envelope.eventKey,
      version: envelope.aggregate.version,
      attempt: String(req.headers['x-atlas-delivery-attempt']),
      traceparent: req.headers.traceparent as string | undefined,
    });
    if (state.mode === 'fail503') {
      res.writeHead(503).end();
      return;
    }
    if (state.mode === 'reject422') {
      res.writeHead(422).end();
      return;
    }
    const conn = await pool.connect();
    try {
      const result = await inPgTransaction(conn, (tx) =>
        consumeOnce(
          tx,
          {
            consumer: CONSUMER,
            ordering: state.ordering,
            event: {
              eventKey: envelope.eventKey,
              topic: envelope.topic,
              schemaVersion: envelope.schemaVersion,
              aggregate: envelope.aggregate,
            },
          },
          async (effectTx) => {
            await effectTx.query(
              `INSERT INTO public.it_outbox_effect (event_key, aggregate_id, amount) VALUES ($1, $2, $3)`,
              [
                envelope.eventKey,
                envelope.aggregate.id,
                (envelope.payload as { amount: string }).amount,
              ],
            );
            await effectTx.query(
              `INSERT INTO public.it_outbox_state (aggregate_id, version, estado) VALUES ($1, $2, $3)
               ON CONFLICT (aggregate_id) DO UPDATE SET version = EXCLUDED.version, estado = EXCLUDED.estado`,
              [
                envelope.aggregate.id,
                envelope.aggregate.version,
                (envelope.payload as { estado?: string }).estado ?? null,
              ],
            );
          },
        ),
      );
      state.results.push(`${envelope.eventKey}:${result.status}`);
    } finally {
      conn.release();
    }
    // El efecto ya confirmó; la respuesta llega tarde: el emisor ve un timeout.
    if (state.mode === 'slow-after-commit') await sleep(600);
    // 2xx SÓLO después de confirmar la inbox: ése es el ACK duradero.
    if (!res.destroyed) res.writeHead(200).end();
  };
  const server: Server = createServer((req, res) => {
    handler(req, res).catch((error: unknown) => {
      if (process.env.OUTBOX_IT_DEBUG) console.error(error);
      if (!res.headersSent) res.writeHead(500).end();
    });
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const { port } = server.address() as AddressInfo;
  const receiverObject = state as Receiver;
  receiverObject.url = `http://127.0.0.1:${port}/eventos`;
  receiverObject.close = () =>
    new Promise<void>((ok) => {
      server.closeAllConnections();
      server.close(() => ok());
    });
  return receiverObject;
}

const baseConfig: OutboxRelayConfig = {
  batchSize: 10,
  leaseMs: 5_000,
  maxAttempts: 5,
  retryBaseMs: 50,
  retryMaxMs: 400,
};

function publisher(timeoutMs = 2_000): HttpEventPublisher {
  return new HttpEventPublisher({ url: receiver.url, signingSecret: SECRET, timeoutMs });
}

async function newClient(): Promise<Client> {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  return client;
}

let seq = 0;
async function emit(
  opts: { aggregateId?: string; amount?: string; estado?: string; key?: string } = {},
): Promise<{ eventKey: string; aggregateId: string }> {
  seq += 1;
  const eventKey = opts.key ?? `it-evento-${seq}`;
  const { rows } = await db.query<{ aggregate_id: string }>(
    `INSERT INTO atlas_accounting.event_outbox (topic, aggregate_type, aggregate_id, event_key, payload)
     VALUES ('it.obligacion', 'it_agregado', COALESCE($1::uuid, gen_random_uuid()), $2, $3::jsonb)
     RETURNING aggregate_id::text`,
    [
      opts.aggregateId ?? null,
      eventKey,
      JSON.stringify({ amount: opts.amount ?? '100.00', estado: opts.estado }),
    ],
  );
  return { eventKey, aggregateId: rows[0]!.aggregate_id };
}

async function row(eventKey: string) {
  const { rows } = await db.query(
    `SELECT status, attempts, published_at, last_error, last_http_status, next_attempt_at,
            dead_at, replay_count, aggregate_version::int AS aggregate_version, lease_owner
     FROM atlas_accounting.event_outbox WHERE event_key = $1`,
    [eventKey],
  );
  return rows[0]!;
}

async function effects(eventKey: string): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    'SELECT count(*)::text AS n FROM public.it_outbox_effect WHERE event_key = $1',
    [eventKey],
  );
  return Number(rows[0]!.n);
}

async function drain(relays: OutboxRelay[], untilMs = 15_000): Promise<void> {
  const deadline = Date.now() + untilMs;
  while (Date.now() < deadline) {
    const { rows } = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM atlas_accounting.event_outbox
       WHERE status = 'PENDING' AND topic = 'it.obligacion'`,
    );
    if (Number(rows[0]!.n) === 0) return;
    await Promise.all(relays.map((relay) => relay.runOnce()));
    await sleep(20);
  }
  throw new Error('El backlog no convergió a tiempo.');
}

/** Deja la cola vacía entre pruebas: lo pendiente de una no debe contaminar a la siguiente. */
async function clearQueue(): Promise<void> {
  await db.query(
    `UPDATE atlas_accounting.event_outbox SET status = 'DEAD', dead_at = now(), lease_owner = NULL
     WHERE status = 'PENDING'`,
  );
}

describeIfDb('Outbox ERP: entrega real y consumo idempotente (PostgreSQL real)', () => {
  beforeAll(async () => {
    harness = installInMemoryTracing();
    admin = new Client({ connectionString: SERVER_URL });
    await admin.connect();
    dbName = `outbox_it_${process.pid}_${Date.now()}`;
    await admin.query(`CREATE DATABASE ${dbName}`);
    dbUrl = urlFor(dbName);
    db = await newClient();

    // Todas las migraciones MENOS la de P-03; luego una fila como las que dejaba el worker que
    // sólo escribía un log; luego la de P-03, que debe etiquetarla sin reescribir su historia.
    const files = [...STARTUP_MIGRATION_FILES];
    const p03 = files.indexOf('src/database/migrations/20260924100000-outbox-entrega-real.sql');
    expect(p03).toBe(files.length - 1);
    await applyMigrations(db, files.slice(0, p03));
    await db.query(
      `INSERT INTO atlas_accounting.event_outbox (topic, aggregate_type, aggregate_id, event_key, payload, published_at)
       VALUES ('it.legacy', 'it_agregado', gen_random_uuid(), $1, '{}'::jsonb, now() - interval '3 days')`,
      [LEGACY_KEY],
    );
    await applyMigrations(db, files.slice(p03));
    // Reaplicar la migración no rompe nada (es idempotente).
    await applyMigrations(db, files.slice(p03));

    await db.query(`
      CREATE TABLE public.it_outbox_effect (
        id bigserial PRIMARY KEY, event_key text NOT NULL, aggregate_id text NOT NULL,
        amount numeric(18,2) NOT NULL
      );
      CREATE TABLE public.it_outbox_state (aggregate_id text PRIMARY KEY, version bigint, estado text);
    `);
    pool = new Pool({ connectionString: dbUrl, max: 12 });
    receiver = await startReceiver();
  });

  afterAll(async () => {
    await receiver?.close();
    await pool?.end();
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await admin.end();
    }
    await harness?.shutdown();
  });

  beforeEach(async () => {
    await clearQueue();
    receiver.mode = 'ok';
    receiver.ordering = 'every-event';
    receiver.wire.length = 0;
    receiver.results.length = 0;
  });

  it('sin transporte configurado no marca publicado ni reserva nada', async () => {
    const { eventKey } = await emit();
    const relay = new OutboxRelay(db, null, baseConfig, silentLogger);

    const summary = await relay.runOnce();

    expect(summary).toEqual(expect.objectContaining({ transportConfigured: false, claimed: 0 }));
    expect(await row(eventKey)).toEqual(
      expect.objectContaining({ status: 'PENDING', published_at: null, attempts: 0 }),
    );
    expect((await relay.backlog()).pending).toBeGreaterThanOrEqual(1);
  });

  it('published_at no puede asignarse sin ACK: la base rechaza la marca de un evento PENDING', async () => {
    const { eventKey } = await emit();
    await expect(
      db.query(
        'UPDATE atlas_accounting.event_outbox SET published_at = now() WHERE event_key = $1',
        [eventKey],
      ),
    ).rejects.toThrow(/chk_event_outbox_published_consistent/);
  });

  it('publica sólo con ACK 2xx del receptor firmado y conserva la traza', async () => {
    const { eventKey } = await emit();
    const traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    await db.query(
      `UPDATE atlas_accounting.event_outbox SET trace_context = $2::jsonb WHERE event_key = $1`,
      [eventKey, JSON.stringify({ traceparent })],
    );
    const relay = new OutboxRelay(db, publisher(), baseConfig, silentLogger, {
      tracer: createOtelDeliveryTracer(new MessagingTraceService(new TracingService())),
    });

    const summary = await relay.runOnce();

    expect(summary.outcomes.PUBLISHED).toBe(1);
    const published = await row(eventKey);
    expect(published.status).toBe('PUBLISHED');
    expect(published.published_at).toBeInstanceOf(Date);
    expect(published.last_http_status).toBe(200);
    expect(published.lease_owner).toBeNull();
    expect(await effects(eventKey)).toBe(1);
    // La traza del productor continúa en el receptor: mismo trace-id, span propio del despacho.
    const wire = receiver.wire.find((w) => w.eventKey === eventKey)!;
    expect(wire.traceparent).toMatch(/^00-0af7651916cd43dd8448eb211c80319c-[0-9a-f]{16}-01$/);
    expect(wire.traceparent).not.toBe(traceparent);
  });

  it('caída antes de enviar: el lease caduca y otro worker lo entrega una sola vez', async () => {
    const { eventKey } = await emit();
    const config = { ...baseConfig, leaseMs: 300 };
    const crashed = new OutboxRelay(db, publisher(), config, silentLogger, { workerId: 'caido' });
    const survivor = new OutboxRelay(db, publisher(), config, silentLogger, { workerId: 'vivo' });

    const claimed = await crashed.claimBatch(); // …y el proceso muere aquí, sin enviar.
    expect(claimed.map((e) => e.event_key)).toContain(eventKey);
    expect((await survivor.runOnce()).claimed).toBe(0); // lease vivo: nadie lo toca

    await sleep(350);
    await survivor.runOnce();

    expect(await row(eventKey)).toEqual(expect.objectContaining({ status: 'PUBLISHED' }));
    expect(receiver.wire.filter((w) => w.eventKey === eventKey)).toHaveLength(1);
    expect(await effects(eventKey)).toBe(1);
  });

  it('ACK recibido y caída antes de marcar publicado: la reentrega se deduplica en la inbox', async () => {
    const { eventKey } = await emit({ amount: '250.00' });
    const config = { ...baseConfig, leaseMs: 300 };
    const crashed = new OutboxRelay(db, publisher(), config, silentLogger, { workerId: 'caido' });

    const [event] = (await crashed.claimBatch()).filter((e) => e.event_key === eventKey);
    const ack = await publisher().publish(toEnvelope(event!), { attempt: 1, traceHeaders: {} });
    expect(ack.outcome).toBe('ACK');
    // …y muere antes del UPDATE a PUBLISHED.
    expect((await row(eventKey)).status).toBe('PENDING');

    await sleep(350);
    const survivor = new OutboxRelay(db, publisher(), config, silentLogger);
    await survivor.runOnce();

    expect(await row(eventKey)).toEqual(expect.objectContaining({ status: 'PUBLISHED' }));
    expect(receiver.wire.filter((w) => w.eventKey === eventKey)).toHaveLength(2);
    expect(receiver.results.filter((r) => r.startsWith(`${eventKey}:`))).toEqual([
      `${eventKey}:APPLIED`,
      `${eventKey}:DUPLICATE`,
    ]);
    expect(await effects(eventKey)).toBe(1);
  });

  it('timeout: queda PENDING con backoff y error redactado, y la reentrega no duplica el efecto', async () => {
    const { eventKey } = await emit();
    receiver.mode = 'slow-after-commit';
    const relay = new OutboxRelay(db, publisher(200), baseConfig, silentLogger);

    const first = await relay.runOnce();

    expect(first.outcomes.RETRY).toBe(1);
    const afterTimeout = await row(eventKey);
    expect(afterTimeout.status).toBe('PENDING');
    expect(afterTimeout.published_at).toBeNull();
    expect(afterTimeout.attempts).toBe(1);
    expect(afterTimeout.last_error).toMatch(/^timeout/);
    expect(afterTimeout.last_error).not.toContain(SECRET);
    expect(new Date(afterTimeout.next_attempt_at).getTime()).toBeGreaterThan(Date.now() - 1_000);

    receiver.mode = 'ok';
    await sleep(700); // backoff (50 ms) y que el receptor lento termine
    await drain([relay]);

    expect(await row(eventKey)).toEqual(
      expect.objectContaining({ status: 'PUBLISHED', attempts: 2 }),
    );
    expect(await effects(eventKey)).toBe(1);
  });

  it('dos workers concurrentes no reservan el mismo evento', async () => {
    const keys: string[] = [];
    for (let i = 0; i < 40; i += 1) keys.push((await emit()).eventKey);
    const clientA = await newClient();
    const clientB = await newClient();
    try {
      const a = new OutboxRelay(
        clientA,
        publisher(),
        { ...baseConfig, batchSize: 7 },
        silentLogger,
      );
      const b = new OutboxRelay(
        clientB,
        publisher(),
        { ...baseConfig, batchSize: 7 },
        silentLogger,
      );

      // Reservas simultáneas: conjuntos disjuntos.
      const [claimA, claimB] = await Promise.all([a.claimBatch(), b.claimBatch()]);
      const idsA = new Set(claimA.map((e) => e.id));
      expect(claimB.some((e) => idsA.has(e.id))).toBe(false);
      for (const e of [...claimA, ...claimB]) {
        await (idsA.has(e.id) ? a : b).deliver(e);
      }

      await drain([a, b]);
    } finally {
      await clientA.end();
      await clientB.end();
    }

    for (const key of keys) {
      expect(receiver.wire.filter((w) => w.eventKey === key)).toHaveLength(1);
      expect(await effects(key)).toBe(1);
      expect((await row(key)).status).toBe('PUBLISHED');
    }
  });

  it('reinicio: un worker nuevo retoma lo que el anterior dejó en vuelo', async () => {
    const keys: string[] = [];
    for (let i = 0; i < 5; i += 1) keys.push((await emit()).eventKey);
    const config = { ...baseConfig, leaseMs: 300 };
    const before = await newClient();
    const old = new OutboxRelay(before, publisher(), config, silentLogger, { workerId: 'antes' });
    expect((await old.claimBatch()).length).toBeGreaterThanOrEqual(5);
    await before.end(); // reinicio: el proceso y su conexión desaparecen

    await sleep(350);
    const after = await newClient();
    try {
      const fresh = new OutboxRelay(after, publisher(), config, silentLogger, {
        workerId: 'despues',
      });
      await drain([fresh]);
    } finally {
      await after.end();
    }

    for (const key of keys) {
      expect((await row(key)).status).toBe('PUBLISHED');
      expect(await effects(key)).toBe(1);
    }
  });

  it('diez reenvíos del mismo evento producen un solo efecto', async () => {
    const { eventKey } = await emit({ amount: '300.00' });
    const relay = new OutboxRelay(db, publisher(), baseConfig, silentLogger);
    const [event] = (await relay.claimBatch()).filter((e) => e.event_key === eventKey);
    const envelope = toEnvelope(event!);

    // Cinco en serie y cinco a la vez: la unicidad de la inbox serializa las simultáneas.
    const results: PublishResult[] = [];
    for (let i = 1; i <= 5; i += 1) {
      results.push(await publisher().publish(envelope, { attempt: i, traceHeaders: {} }));
    }
    results.push(
      ...(await Promise.all(
        [6, 7, 8, 9, 10].map((attempt) =>
          publisher().publish(envelope, { attempt, traceHeaders: {} }),
        ),
      )),
    );

    expect(results.every((r) => r.outcome === 'ACK')).toBe(true);
    expect(receiver.wire.filter((w) => w.eventKey === eventKey)).toHaveLength(10);
    expect(receiver.results.filter((r) => r === `${eventKey}:APPLIED`)).toHaveLength(1);
    expect(await effects(eventKey)).toBe(1);
    const { rows } = await db.query<{ total: string; suma: string }>(
      `SELECT count(*)::text AS total, sum(amount)::text AS suma FROM public.it_outbox_effect WHERE event_key = $1`,
      [eventKey],
    );
    expect(rows[0]).toEqual({ total: '1', suma: '300.00' });
    const inbox = await db.query(
      'SELECT outcome FROM atlas_accounting.event_inbox WHERE consumer = $1 AND event_key = $2',
      [CONSUMER, eventKey],
    );
    expect(inbox.rows).toEqual([{ outcome: 'APPLIED' }]);
  });

  it('orden invertido: una versión vieja no revierte el estado nuevo en el consumidor', async () => {
    receiver.ordering = 'latest-state';
    const aggregateId = '11111111-2222-4333-8444-555555555555';
    const v1 = await emit({ aggregateId, estado: 'ABIERTA' });
    const v2 = await emit({ aggregateId, estado: 'PAGADA' });
    expect((await row(v1.eventKey)).aggregate_version).toBe(1);
    expect((await row(v2.eventKey)).aggregate_version).toBe(2);

    const relay = new OutboxRelay(db, publisher(), baseConfig, silentLogger);
    const envelopeOf = async (key: string) => {
      const { rows } = await db.query(
        `SELECT id::text, topic, aggregate_type, aggregate_id::text, aggregate_version::text,
                schema_version, event_key, payload, trace_context, created_at, attempts
         FROM atlas_accounting.event_outbox WHERE event_key = $1`,
        [key],
      );
      return toEnvelope(rows[0] as never);
    };
    // Llega primero la v2 y DESPUÉS la v1 (reentrega tardía).
    await publisher().publish(await envelopeOf(v2.eventKey), { attempt: 1, traceHeaders: {} });
    await publisher().publish(await envelopeOf(v1.eventKey), { attempt: 1, traceHeaders: {} });

    const state = await db.query(
      'SELECT version::int, estado FROM public.it_outbox_state WHERE aggregate_id = $1',
      [aggregateId],
    );
    expect(state.rows).toEqual([{ version: 2, estado: 'PAGADA' }]);
    expect(receiver.results).toEqual([`${v2.eventKey}:APPLIED`, `${v1.eventKey}:STALE`]);
    await relay.runOnce(); // el relay los marca (la inbox descarta los duplicados)
  });

  it('el relay entrega en orden por agregado y no adelanta a una versión muerta', async () => {
    const aggregateId = '22222222-3333-4444-8555-666666666666';
    const events: { eventKey: string; aggregateId: string }[] = [];
    for (let i = 0; i < 3; i += 1) events.push(await emit({ aggregateId }));
    const relay = new OutboxRelay(db, publisher(), baseConfig, silentLogger);

    // v1 rechazada definitivamente → DEAD: v2 y v3 no se entregan por delante.
    receiver.mode = 'reject422';
    await relay.runOnce();
    expect((await row(events[0]!.eventKey)).status).toBe('DEAD');
    receiver.mode = 'ok';
    expect((await relay.runOnce()).claimed).toBe(0);
    expect((await row(events[1]!.eventKey)).status).toBe('PENDING');

    // Replay de la v1 y el agregado sale en orden 1, 2, 3.
    await inPgTransaction(db, (tx) => replayEvent(tx, events[0]!.eventKey));
    receiver.wire.length = 0;
    await drain([relay]);
    const keys = events.map((e) => e.eventKey);
    expect(receiver.wire.filter((w) => keys.includes(w.eventKey)).map((w) => w.version)).toEqual([
      1, 2, 3,
    ]);
  });

  it('backlog converge tras recuperar el receptor', async () => {
    const keys: string[] = [];
    for (let i = 0; i < 15; i += 1) keys.push((await emit()).eventKey);
    receiver.mode = 'fail503';
    const relay = new OutboxRelay(
      db,
      publisher(),
      { ...baseConfig, maxAttempts: 50 },
      silentLogger,
    );

    for (let i = 0; i < 3; i += 1) {
      await relay.runOnce();
      await sleep(60);
    }
    for (const key of keys) {
      const r = await row(key);
      expect(r.status).toBe('PENDING');
      expect(r.published_at).toBeNull();
    }
    expect((await row(keys[0]!)).last_http_status).toBe(503);
    const status = await readOutboxStatus(db);
    expect(status.counts.PENDING).toBeGreaterThanOrEqual(15);
    expect(status.maxPendingAttempts).toBeGreaterThanOrEqual(1);

    receiver.mode = 'ok';
    await drain([relay]);

    for (const key of keys) {
      expect((await row(key)).status).toBe('PUBLISHED');
      expect(await effects(key)).toBe(1);
    }
  });

  it('agotado: pasa a DEAD visible y el replay autorizado lo reentrega', async () => {
    const { eventKey } = await emit();
    receiver.mode = 'fail503';
    const relay = new OutboxRelay(db, publisher(), { ...baseConfig, maxAttempts: 2 }, silentLogger);

    await relay.runOnce();
    await sleep(80);
    await relay.runOnce();

    const dead = await row(eventKey);
    expect(dead).toEqual(
      expect.objectContaining({ status: 'DEAD', attempts: 2, published_at: null }),
    );
    expect(dead.dead_at).toBeInstanceOf(Date);
    expect((await listDeadEvents(db, 200)).map((e) => e.eventKey)).toContain(eventKey);
    expect((await readOutboxStatus(db)).counts.DEAD).toBeGreaterThanOrEqual(1);
    expect((await relay.runOnce()).claimed).toBe(0); // DEAD no se reintenta solo

    const replay = await inPgTransaction(db, (tx) => replayEvent(tx, eventKey));
    expect(replay).toEqual(
      expect.objectContaining({ outcome: 'REPLAYED', previousStatus: 'DEAD', replayCount: 1 }),
    );
    receiver.mode = 'ok';
    await drain([relay]);
    expect(await row(eventKey)).toEqual(
      expect.objectContaining({ status: 'PUBLISHED', replay_count: 1 }),
    );
    expect(await effects(eventKey)).toBe(1);

    // Lo ya confirmado no se reenvía por esta vía.
    expect(await inPgTransaction(db, (tx) => replayEvent(tx, eventKey))).toEqual({
      outcome: 'NOT_REPLAYABLE',
      status: 'PUBLISHED',
    });
  });

  it('un 4xx definitivo (422) va a DEAD sin agotar reintentos', async () => {
    const { eventKey } = await emit();
    receiver.mode = 'reject422';
    const relay = new OutboxRelay(db, publisher(), baseConfig, silentLogger);

    await relay.runOnce();

    expect(await row(eventKey)).toEqual(
      expect.objectContaining({ status: 'DEAD', attempts: 1, last_http_status: 422 }),
    );
  });

  it('la migración etiqueta LEGACY_LOG_ONLY lo que el worker antiguo marcó sin entregar', async () => {
    const legacy = await row(LEGACY_KEY);
    expect(legacy.status).toBe('LEGACY_LOG_ONLY');
    expect(legacy.published_at).toBeInstanceOf(Date); // la historia no se reescribe
    expect(legacy.aggregate_version).toBe(1);
    const relay = new OutboxRelay(db, publisher(), baseConfig, silentLogger);
    await relay.runOnce();
    expect(receiver.wire.map((w) => w.eventKey)).not.toContain(LEGACY_KEY);
  });

  it('la versión de agregado la asigna la base aunque dos transacciones emitan a la vez', async () => {
    const aggregateId = '33333333-4444-4555-8666-777777777777';
    const t1 = await newClient();
    const t2 = await newClient();
    try {
      await t1.query('BEGIN');
      await t1.query(
        `INSERT INTO atlas_accounting.event_outbox (topic, aggregate_type, aggregate_id, event_key, payload)
         VALUES ('it.version', 'it_agregado', $1, 'ver-a', '{}'::jsonb)`,
        [aggregateId],
      );
      await t2.query('BEGIN');
      const second = t2.query(
        `INSERT INTO atlas_accounting.event_outbox (topic, aggregate_type, aggregate_id, event_key, payload)
         VALUES ('it.version', 'it_agregado', $1, 'ver-b', '{}'::jsonb)`,
        [aggregateId],
      );
      await sleep(100); // t2 espera el candado del agregado
      await t1.query('COMMIT');
      await second;
      await t2.query('COMMIT');
    } finally {
      await t1.end();
      await t2.end();
    }
    const { rows } = await db.query(
      `SELECT event_key, aggregate_version::int AS v FROM atlas_accounting.event_outbox
       WHERE aggregate_id = $1 ORDER BY v`,
      [aggregateId],
    );
    expect(rows).toEqual([
      { event_key: 'ver-a', v: 1 },
      { event_key: 'ver-b', v: 2 },
    ]);
  });

  it('el modelo Sequelize de los productores sigue insertando: PENDING y versión asignada', async () => {
    const sequelize = new Sequelize(dbUrl, { dialect: 'postgres', logging: false });
    sequelize.addModels([EventOutboxModel]);
    try {
      const created = await EventOutboxModel.create({
        topic: 'it.sequelize',
        aggregateType: 'it_agregado',
        aggregateId: '44444444-5555-4666-8777-888888888888',
        eventKey: 'it-sequelize-1',
        payload: { a: 1 },
      });
      await created.reload();
      expect(created.status).toBe('PENDING');
      expect(created.publishedAt).toBeNull();
      expect(Number(created.aggregateVersion)).toBe(1);
    } finally {
      await sequelize.close();
    }
  });
});
