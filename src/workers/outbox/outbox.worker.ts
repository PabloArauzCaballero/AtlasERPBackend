import { setTimeout as wait } from 'timers/promises';
import { Client } from 'pg';
import { env } from '../../config/env';
import { resolveDbSslOptions } from '../../config/db-ssl';
import { PinoLoggerService } from '../../common/logger/pino-logger.service';

interface OutboxRow {
  id: string;
  topic: string;
  aggregate_type: string;
  aggregate_id: string;
  event_key: string;
  payload: unknown;
}

const logger = new PinoLoggerService();
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
        SELECT id, topic, aggregate_type, aggregate_id, event_key, payload
        FROM atlas_accounting.event_outbox
        WHERE published_at IS NULL
        ORDER BY id ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      `,
      [env.OUTBOX_WORKER_BATCH_SIZE],
    );

    for (const event of result.rows) {
      await publishEvent(event);
      await client.query(
        'UPDATE atlas_accounting.event_outbox SET published_at = now() WHERE id = $1',
        [event.id],
      );
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
