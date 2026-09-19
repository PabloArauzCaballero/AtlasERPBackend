/**
 * La traza sobrevive al salto asíncrono: API → fila del outbox → worker.
 *
 * Se ejecuta contra PostgreSQL de verdad y se salta —sin fingir que pasó— cuando no hay base:
 * lo que se mide aquí es que un contexto serializado en una columna se reconstruye en otro
 * proceso, y un doble en memoria daría eso por bueno sin haberlo probado.
 *
 *   ATLAS_OBS_IT_DATABASE_URL=postgresql://... npx jest test/outbox-trace-continuity
 */
import { Client } from 'pg';
import { SpanKind, propagation, context as otelContext } from '@opentelemetry/api';
import { MessagingTraceService } from '../src/common/observability/messaging-trace.service';
import { TracingService } from '../src/common/observability/tracing.service';
import { outboxConsumerAttributes } from '../src/common/observability/messaging-attributes';
import { SPAN_NAMES } from '../src/observability/telemetry.constants';
import {
  installInMemoryTracing,
  type TracingHarness,
} from '../src/common/observability/__pruebas__/support/in-memory-tracing';

const URL_BASE = process.env.ATLAS_OBS_IT_DATABASE_URL;
const describeSiHayBase = URL_BASE ? describe : describe.skip;

let client: Client;
let harness: TracingHarness;
const tracing = new TracingService();
const messaging = new MessagingTraceService(tracing);
const TOPIC = 'observabilidad.prueba';

beforeAll(async () => {
  harness = installInMemoryTracing();
  if (!URL_BASE) return;
  client = new Client({ connectionString: URL_BASE });
  await client.connect();
});

afterEach(() => harness.reset());

afterAll(async () => {
  if (URL_BASE) {
    await client.query('DELETE FROM atlas_accounting.event_outbox WHERE topic = $1', [TOPIC]);
    await client.end();
  }
  await harness.shutdown();
});

/** Publica como lo hace la API: portador dentro del span productor, en `trace_context`. */
async function publicar(sufijo: string): Promise<{ eventKey: string }> {
  const eventKey = `obs-${Date.now()}-${sufijo}`;
  await messaging.runAsProducer(SPAN_NAMES.outboxPublish, {}, async () => {
    const carrier: Record<string, string> = {};
    propagation.inject(otelContext.active(), carrier);
    await client.query(
      `INSERT INTO atlas_accounting.event_outbox
         (topic, aggregate_type, aggregate_id, event_key, payload, trace_context)
       VALUES ($1, 'accounting_document', gen_random_uuid(), $2, '{}'::jsonb, $3::jsonb)`,
      [TOPIC, eventKey, JSON.stringify(carrier)],
    );
  });
  return { eventKey };
}

/** Consume como lo hace el worker: lee la columna y reconstruye el contexto. */
async function consumir(eventKey: string): Promise<void> {
  const { rows } = await client.query<{ trace_context: Record<string, string> | null }>(
    'SELECT trace_context FROM atlas_accounting.event_outbox WHERE event_key = $1',
    [eventKey],
  );
  await messaging.runAsConsumer(
    SPAN_NAMES.outboxDispatch,
    rows[0]?.trace_context ?? null,
    outboxConsumerAttributes({ eventType: TOPIC, aggregateType: 'accounting_document' }),
    async () => {
      await client.query(
        'UPDATE atlas_accounting.event_outbox SET published_at = now() WHERE event_key = $1',
        [eventKey],
      );
    },
  );
}

describeSiHayBase('continuidad de la traza a través del outbox del ERP', () => {
  it('productor y consumidor comparten trace_id con spans propios y la relación correcta', async () => {
    const { eventKey } = await publicar('continuidad');
    await consumir(eventKey);

    const productor = harness.spanNamed(SPAN_NAMES.outboxPublish)!;
    const consumidor = harness.spanNamed(SPAN_NAMES.outboxDispatch)!;
    expect(consumidor.spanContext().traceId).toBe(productor.spanContext().traceId);
    expect(consumidor.spanContext().spanId).not.toBe(productor.spanContext().spanId);
    expect(consumidor.parentSpanContext?.spanId).toBe(productor.spanContext().spanId);
    expect(productor.kind).toBe(SpanKind.PRODUCER);
    expect(consumidor.kind).toBe(SpanKind.CONSUMER);
  });

  it('el portador se persiste en trace_context y el payload NO se toca', async () => {
    const { eventKey } = await publicar('columna');
    const { rows } = await client.query<{ trace_context: Record<string, string>; payload: unknown }>(
      'SELECT trace_context, payload FROM atlas_accounting.event_outbox WHERE event_key = $1',
      [eventKey],
    );
    expect(rows[0]?.trace_context.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
    // El contrato de dominio del evento no cambia para transportar trazabilidad.
    expect(rows[0]?.payload).toEqual({});
  });

  it('una fila ANTERIOR a la columna (trace_context NULL) se procesa igual, con su propia traza', async () => {
    const { eventKey } = await publicar('antigua');
    await client.query(
      'UPDATE atlas_accounting.event_outbox SET trace_context = NULL WHERE event_key = $1',
      [eventKey],
    );
    harness.reset();

    await consumir(eventKey);

    const consumidor = harness.spanNamed(SPAN_NAMES.outboxDispatch)!;
    expect(consumidor.parentSpanContext).toBeUndefined();
    expect(consumidor.spanContext().traceId).toMatch(/^[0-9a-f]{32}$/);
    const { rows } = await client.query<{ published_at: Date | null }>(
      'SELECT published_at FROM atlas_accounting.event_outbox WHERE event_key = $1',
      [eventKey],
    );
    // Lo que importa: el trabajo se hizo.
    expect(rows[0]?.published_at).not.toBeNull();
  });

  it('un portador manipulado no rompe el despacho', async () => {
    const { eventKey } = await publicar('manipulada');
    await client.query(
      `UPDATE atlas_accounting.event_outbox SET trace_context = '{"traceparent":"basura"}'::jsonb WHERE event_key = $1`,
      [eventKey],
    );
    harness.reset();

    await expect(consumir(eventKey)).resolves.toBeUndefined();
    expect(harness.spanNamed(SPAN_NAMES.outboxDispatch)).toBeDefined();
  });
});
