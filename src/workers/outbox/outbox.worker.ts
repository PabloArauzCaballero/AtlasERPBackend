// Primero de todo, igual que en `main.ts`: este worker abre su propio `pg.Client` y sin el SDK
// arrancado antes, esa conexión no queda instrumentada y sus consultas no aparecen en ninguna traza.
import { startTracing, stopTracing } from '../../observability/tracing';

startTracing('atlas-erp-worker-outbox');

import { setTimeout as wait } from 'timers/promises';
import { Client } from 'pg';
import { env } from '../../config/env';
import { resolveDbSslOptions } from '../../config/db-ssl';
import { PinoLoggerService } from '../../common/logger/pino-logger.service';
import { MessagingTraceService } from '../../common/observability/messaging-trace.service';
import { TracingService } from '../../common/observability/tracing.service';
import { HttpEventPublisher } from './http-event-publisher';
import { OutboxRelay } from './outbox-relay';
import { createOtelDeliveryTracer } from './outbox-tracing';

const logger = new PinoLoggerService();
// Construido a mano: este worker no levanta el contenedor de NestJS, así que no hay inyección.
const messaging = new MessagingTraceService(new TracingService());
let isShuttingDown = false;

/** Cada cuánto se repite el aviso de «sin transporte» mientras siga sin configurarse. */
const UNCONFIGURED_WARNING_EVERY_MS = 60_000;

const tracer = createOtelDeliveryTracer(messaging);

function buildPublisher(): HttpEventPublisher | null {
  if (!env.OUTBOX_DELIVERY_URL || !env.OUTBOX_DELIVERY_SIGNING_SECRET) return null;
  return new HttpEventPublisher({
    url: env.OUTBOX_DELIVERY_URL,
    signingSecret: env.OUTBOX_DELIVERY_SIGNING_SECRET,
    timeoutMs: env.OUTBOX_DELIVERY_TIMEOUT_MS,
  });
}

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
  const relay = new OutboxRelay(
    client,
    buildPublisher(),
    {
      batchSize: env.OUTBOX_WORKER_BATCH_SIZE,
      leaseMs: env.OUTBOX_LEASE_MS,
      maxAttempts: env.OUTBOX_MAX_ATTEMPTS,
      retryBaseMs: env.OUTBOX_RETRY_BASE_MS,
      retryMaxMs: env.OUTBOX_RETRY_MAX_MS,
    },
    logger,
    { tracer },
  );
  logger.info('Outbox worker iniciado.', {
    layer: 'worker',
    worker: 'outbox',
    workerId: relay.workerId,
    transportConfigured: relay.transportConfigured,
    batchSize: env.OUTBOX_WORKER_BATCH_SIZE,
    pollIntervalMs: env.OUTBOX_WORKER_POLL_INTERVAL_MS,
    leaseMs: env.OUTBOX_LEASE_MS,
    maxAttempts: env.OUTBOX_MAX_ATTEMPTS,
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

  let lastUnconfiguredWarning = 0;
  while (!isShuttingDown) {
    try {
      if (!relay.transportConfigured) {
        // Sin transporte NO se finge entrega: los eventos quedan PENDING y se dice cuántos.
        if (Date.now() - lastUnconfiguredWarning >= UNCONFIGURED_WARNING_EVERY_MS) {
          lastUnconfiguredWarning = Date.now();
          logger.warn(
            'Outbox sin transporte: OUTBOX_DELIVERY_URL no configurada. Nada se marca publicado.',
            { layer: 'worker', worker: 'outbox', ...(await relay.backlog()) },
          );
        }
        await wait(env.OUTBOX_WORKER_POLL_INTERVAL_MS);
        continue;
      }

      const summary = await relay.runOnce();
      if (summary.claimed > 0) {
        logger.info('Ciclo outbox completado.', {
          layer: 'worker',
          worker: 'outbox',
          claimed: summary.claimed,
          ...summary.outcomes,
        });
      } else {
        await wait(env.OUTBOX_WORKER_POLL_INTERVAL_MS);
      }
    } catch (error) {
      logger.error('Fallo procesando outbox batch.', { layer: 'worker', worker: 'outbox', error });
      await wait(env.OUTBOX_WORKER_POLL_INTERVAL_MS);
    }
  }
}

void main().catch((error) => {
  logger.error('Outbox worker detenido por error fatal.', {
    layer: 'worker',
    worker: 'outbox',
    error,
  });
  process.exitCode = 1;
});
