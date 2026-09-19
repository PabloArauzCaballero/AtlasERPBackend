// Primero de todo, igual que en `main.ts`: este worker abre su propio `pg.Client` y sin el SDK
// arrancado antes, esa conexión no queda instrumentada y sus consultas no aparecen en ninguna traza.
import { startTracing, stopTracing } from '../../observability/tracing';

startTracing('atlas-erp-worker-outbox');

import { setTimeout as wait } from 'timers/promises';
import { Client } from 'pg';
import { env } from '../../config/env';
import { resolveDbSslOptions } from '../../config/db-ssl';
import { PinoLoggerService } from '../../common/logger/pino-logger.service';
import { outboxConsumerAttributes } from '../../common/observability/messaging-attributes';
import { MessagingTraceService } from '../../common/observability/messaging-trace.service';
import { TracingService } from '../../common/observability/tracing.service';
import { SPAN_NAMES } from '../../observability/telemetry.constants';

interface OutboxRow {
  id: string;
  topic: string;
  aggregate_type: string;
  aggregate_id: string;
  event_key: string;
  payload: unknown;
  /** Portador W3C que escribió la API. `null` en las filas anteriores a la columna. */
  trace_context: Record<string, string> | null;
}

const logger = new PinoLoggerService();
// Construido a mano: este worker no levanta el contenedor de NestJS, así que no hay inyección.
const messaging = new MessagingTraceService(new TracingService());
let isShuttingDown = false;

async function main(): Promise<void> {
  if (!env.OUTBOX_WORKER_ENABLED) {
    logger.warn('OUTBOX_WORKER_ENABLED=false. Worker finalizado sin procesar eventos.', {
      layer: 'worker',
      worker: 'outbox',
    });
    return;
  }

  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: resolveDbSslOptions(env),
  });

  await client.connect();
  logger.info('Outbox worker iniciado.', {
    layer: 'worker',
    worker: 'outbox',
    batchSize: env.OUTBOX_WORKER_BATCH_SIZE,
    pollIntervalMs: env.OUTBOX_WORKER_POLL_INTERVAL_MS,
  });

  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info('Apagado controlado recibido.', { layer: 'worker', worker: 'outbox', signal });
    await wait(env.WORKER_SHUTDOWN_TIMEOUT_SECONDS * 1000, undefined, { ref: false }).catch(
      () => undefined,
    );
    // Antes de cerrar la conexión: vacía el lote de spans pendiente. Nunca lanza.
    await stopTracing();
    await client.end().catch((error: unknown) =>
      logger.error('Error cerrando conexión PostgreSQL.', {
        layer: 'worker',
        worker: 'outbox',
        error,
      }),
    );
    process.exit(0);
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  while (!isShuttingDown) {
    try {
      const processed = await processBatch(client);
      if (processed === 0) {
        await wait(env.OUTBOX_WORKER_POLL_INTERVAL_MS);
      }
    } catch (error) {
      logger.error('Fallo procesando outbox batch.', { layer: 'worker', worker: 'outbox', error });
      await wait(env.OUTBOX_WORKER_POLL_INTERVAL_MS);
    }
  }
}

async function processBatch(client: Client): Promise<number> {
  await client.query('BEGIN');
  try {
    const result = await client.query<OutboxRow>(
      `
        SELECT id, topic, aggregate_type, aggregate_id, event_key, payload, trace_context
        FROM atlas_accounting.event_outbox
        WHERE published_at IS NULL
        ORDER BY id ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      `,
      [env.OUTBOX_WORKER_BATCH_SIZE],
    );

    for (const event of result.rows) {
      await dispatchEvent(client, event);
    }

    await client.query('COMMIT');
    if (result.rowCount && result.rowCount > 0) {
      logger.info('Eventos outbox publicados.', {
        layer: 'worker',
        worker: 'outbox',
        count: result.rowCount,
      });
    }
    return result.rowCount ?? 0;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/**
 * Despacha UNA fila dentro de un span CONSUMIDOR enlazado con quien la publicó.
 *
 * Es el único punto del ERP donde la traza cruza de un proceso a otro: el contexto murió con el
 * commit de la API y aquí se RECONSTRUYE desde `trace_context`. Una fila escrita antes de que
 * existiera esa columna trae `null` y abre su propia traza: se procesa igual, que es lo que
 * importa.
 */
async function dispatchEvent(client: Client, event: OutboxRow): Promise<void> {
  await messaging.runAsConsumer(
    SPAN_NAMES.outboxDispatch,
    event.trace_context,
    outboxConsumerAttributes({
      eventType: event.topic,
      aggregateType: event.aggregate_type,
      aggregateId: event.aggregate_id,
    }),
    async () => {
      await publishEvent(event);
      await client.query(
        'UPDATE atlas_accounting.event_outbox SET published_at = now() WHERE id = $1',
        [event.id],
      );
    },
  );
}

async function publishEvent(event: OutboxRow): Promise<void> {
  // Punto único de publicación. En esta entrega se marca como publicado localmente;
  // si luego se conecta Kafka/SNS/Webhook, este método es el único que debe cambiar.
  logger.debug('Evento outbox publicado localmente.', {
    layer: 'worker',
    worker: 'outbox',
    eventKey: event.event_key,
    topic: event.topic,
    aggregateType: event.aggregate_type,
    aggregateId: event.aggregate_id,
  });
}

void main().catch((error) => {
  logger.error('Outbox worker detenido por error fatal.', {
    layer: 'worker',
    worker: 'outbox',
    error,
  });
  process.exitCode = 1;
});
