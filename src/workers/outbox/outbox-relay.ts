/**
 * Núcleo del worker de outbox: reserva por lease → entrega fuera de transacción → confirmación.
 *
 * Tres pasos, tres momentos, y ninguna transacción abierta mientras se espera a la red:
 *
 *   1. `claimBatch`: UNA sentencia (transacción implícita y corta) que toma eventos PENDING cuyo
 *      turno llegó y sin lease vivo, con `FOR UPDATE SKIP LOCKED`, y les pone dueño y caducidad.
 *      Dos workers nunca reservan el mismo evento a la vez; si uno muere, el lease caduca y otro
 *      lo retoma. Sólo se reserva la CABEZA de cada agregado: nada con una versión anterior aún
 *      pendiente o muerta, así el receptor ve los eventos de un agregado en orden.
 *   2. `publisher.publish`: la llamada de red. Sin conexión de base reservada para ella.
 *   3. `markPublished` / `markFailed`: otra sentencia corta. `published_at` se asigna SÓLO tras
 *      un ACK del receptor. Nunca por escribir un log.
 *
 * Garantía: al menos una vez. Una caída entre el ACK y la marca reentrega el evento; la inbox del
 * consumidor (`src/common/events/event-inbox.ts`) hace que el efecto se aplique una sola vez.
 */
import { randomUUID } from 'node:crypto';
import {
  OUTBOX_ENVELOPE_SPEC,
  type EventPublisher,
  type OutboxEnvelope,
  type PublishResult,
} from './event-publisher.port';
import { redactDeliveryError } from './http-event-publisher';
import type { Queryable } from '../../common/events/queryable';

export type { Queryable };

export interface OutboxRelayConfig {
  batchSize: number;
  leaseMs: number;
  maxAttempts: number;
  retryBaseMs: number;
  retryMaxMs: number;
}

export interface OutboxRelayLogger {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

/**
 * Envoltura de cada entrega en un span consumidor. Por defecto no traza; el worker inyecta la
 * implementación de OpenTelemetry. Recibe el portador guardado y devuelve el del span activo.
 */
export type DeliveryTracer = <T>(
  event: ClaimedEvent,
  operation: (traceHeaders: Record<string, string>) => Promise<T>,
) => Promise<T>;

export interface ClaimedEvent {
  id: string;
  topic: string;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: string;
  schema_version: number;
  event_key: string;
  payload: unknown;
  trace_context: Record<string, unknown> | null;
  created_at: Date;
  attempts: number;
}

export type DeliveryOutcome = 'PUBLISHED' | 'RETRY' | 'DEAD' | 'LEASE_LOST';

export interface RunSummary {
  transportConfigured: boolean;
  claimed: number;
  outcomes: Record<DeliveryOutcome, number>;
}

export interface OutboxBacklog {
  pending: number;
  dead: number;
  oldestPendingAgeSeconds: number | null;
  maxPendingAttempts: number;
}

/** base · 2^(intento−1), con tope. El intento 1 espera `base`. */
export function computeBackoffMs(attempt: number, baseMs: number, maxMs: number): number {
  const exponent = Math.max(0, attempt - 1);
  // 2^31 ya supera cualquier tope razonable; se corta antes de perder precisión.
  if (exponent >= 31) return maxMs;
  return Math.min(maxMs, baseMs * 2 ** exponent);
}

export function toEnvelope(event: ClaimedEvent): OutboxEnvelope {
  return {
    spec: OUTBOX_ENVELOPE_SPEC,
    eventKey: event.event_key,
    topic: event.topic,
    schemaVersion: event.schema_version,
    aggregate: {
      type: event.aggregate_type,
      id: event.aggregate_id,
      version: Number(event.aggregate_version),
    },
    occurredAt: new Date(event.created_at).toISOString(),
    producer: 'atlas-erp',
    payload: event.payload,
  };
}

const T = 'atlas_accounting.event_outbox';

export class OutboxRelay {
  readonly workerId: string;

  constructor(
    private readonly db: Queryable,
    /** `null` = sin transporte configurado: el relay no reserva ni marca nada. */
    private readonly publisher: EventPublisher | null,
    private readonly config: OutboxRelayConfig,
    private readonly logger: OutboxRelayLogger,
    options: { workerId?: string; tracer?: DeliveryTracer } = {},
  ) {
    this.workerId = options.workerId ?? `outbox-${process.pid}-${randomUUID().slice(0, 8)}`;
    this.tracer = options.tracer ?? ((_event, operation) => operation({}));
  }

  private readonly tracer: DeliveryTracer;

  get transportConfigured(): boolean {
    return this.publisher !== null;
  }

  /** Paso 1. Transacción implícita de UNA sentencia: nada queda bloqueado al volver. */
  async claimBatch(): Promise<ClaimedEvent[]> {
    const { rows } = await this.db.query<ClaimedEvent & Record<string, unknown>>(
      `
        WITH candidatos AS (
          SELECT e.id
          FROM ${T} e
          WHERE e.status = 'PENDING'
            AND e.next_attempt_at <= now()
            AND (e.lease_expires_at IS NULL OR e.lease_expires_at < now())
            AND NOT EXISTS (
              SELECT 1 FROM ${T} previo
              WHERE previo.aggregate_type = e.aggregate_type
                AND previo.aggregate_id = e.aggregate_id
                AND previo.aggregate_version < e.aggregate_version
                AND previo.status IN ('PENDING', 'DEAD')
            )
          ORDER BY e.next_attempt_at, e.id
          LIMIT $1
          FOR UPDATE OF e SKIP LOCKED
        )
        UPDATE ${T} e
        SET lease_owner = $2,
            lease_expires_at = now() + ($3::bigint * interval '1 millisecond'),
            attempts = e.attempts + 1,
            last_attempt_at = now()
        FROM candidatos
        WHERE e.id = candidatos.id
        RETURNING e.id::text AS id, e.topic, e.aggregate_type, e.aggregate_id::text AS aggregate_id,
                  e.aggregate_version::text AS aggregate_version, e.schema_version, e.event_key,
                  e.payload, e.trace_context, e.created_at, e.attempts
      `,
      [this.config.batchSize, this.workerId, this.config.leaseMs],
    );
    return rows.sort((a, b) => Number(a.id) - Number(b.id));
  }

  /** Pasos 2 y 3 para un evento reservado. */
  async deliver(event: ClaimedEvent): Promise<DeliveryOutcome> {
    if (!this.publisher) throw new Error('OutboxRelay sin transporte: no se puede entregar.');

    // Reservado más veces de las permitidas sin llegar a confirmar ni fallar (el worker murió en
    // cada intento): no se envía otra vez a ciegas, se deja visible.
    if (event.attempts > this.config.maxAttempts) {
      return this.markFailed(event, {
        outcome: 'REJECTED',
        error: `agotado: ${event.attempts - 1} reservas sin confirmación`,
        httpStatus: null,
      });
    }

    let result: PublishResult;
    try {
      result = await this.tracer(event, (traceHeaders) =>
        this.publisher!.publish(toEnvelope(event), { attempt: event.attempts, traceHeaders }),
      );
    } catch (error) {
      result = {
        outcome: 'RETRY',
        error: redactDeliveryError(
          `fallo del adaptador: ${error instanceof Error ? error.message : String(error)}`,
        ),
        httpStatus: null,
      };
    }

    if (result.outcome === 'ACK') return this.markPublished(event, result.httpStatus);
    return this.markFailed(event, result);
  }

  /** Un ciclo completo. Devuelve lo que pasó con cada evento reservado. */
  async runOnce(): Promise<RunSummary> {
    const outcomes: Record<DeliveryOutcome, number> = {
      PUBLISHED: 0,
      RETRY: 0,
      DEAD: 0,
      LEASE_LOST: 0,
    };
    if (!this.publisher) return { transportConfigured: false, claimed: 0, outcomes };

    const claimed = await this.claimBatch();
    for (const event of claimed) {
      outcomes[await this.deliver(event)] += 1;
    }
    return { transportConfigured: true, claimed: claimed.length, outcomes };
  }

  async backlog(): Promise<OutboxBacklog> {
    const { rows } = await this.db.query<{
      pending: string;
      dead: string;
      oldest_pending_age_seconds: string | null;
      max_pending_attempts: number | null;
    }>(
      `
        SELECT
          count(*) FILTER (WHERE status = 'PENDING')::text AS pending,
          count(*) FILTER (WHERE status = 'DEAD')::text AS dead,
          floor(extract(epoch FROM now() - min(created_at) FILTER (WHERE status = 'PENDING')))::text
            AS oldest_pending_age_seconds,
          max(attempts) FILTER (WHERE status = 'PENDING') AS max_pending_attempts
        FROM ${T}
      `,
    );
    const row = rows[0];
    return {
      pending: Number(row?.pending ?? 0),
      dead: Number(row?.dead ?? 0),
      oldestPendingAgeSeconds:
        row?.oldest_pending_age_seconds == null ? null : Number(row.oldest_pending_age_seconds),
      maxPendingAttempts: Number(row?.max_pending_attempts ?? 0),
    };
  }

  private async markPublished(
    event: ClaimedEvent,
    httpStatus: number | null,
  ): Promise<DeliveryOutcome> {
    // Sin exigir el lease: el ACK es un hecho aunque el lease haya caducado. Si otro worker lo
    // retomó, entregará de nuevo y la inbox del consumidor descartará el duplicado.
    const { rows } = await this.db.query(
      `
        UPDATE ${T}
        SET status = 'PUBLISHED', published_at = now(), dead_at = NULL,
            last_http_status = $2, last_error = NULL,
            lease_owner = NULL, lease_expires_at = NULL
        WHERE id = $1 AND status IN ('PENDING', 'DEAD')
        RETURNING id
      `,
      [event.id, httpStatus],
    );
    if (rows.length === 0) return 'LEASE_LOST';
    return 'PUBLISHED';
  }

  private async markFailed(
    event: ClaimedEvent,
    result: Exclude<PublishResult, { outcome: 'ACK' }>,
  ): Promise<DeliveryOutcome> {
    const definitive = result.outcome === 'REJECTED';
    const delayMs = computeBackoffMs(
      event.attempts,
      this.config.retryBaseMs,
      this.config.retryMaxMs,
    );
    const { rows } = await this.db.query<{ status: string }>(
      `
        UPDATE ${T}
        SET status = CASE WHEN $3::boolean OR attempts >= $4 THEN 'DEAD' ELSE 'PENDING' END,
            dead_at = CASE WHEN $3::boolean OR attempts >= $4 THEN now() ELSE NULL END,
            next_attempt_at = now() + ($5::bigint * interval '1 millisecond'),
            last_error = $6, last_http_status = $7,
            lease_owner = NULL, lease_expires_at = NULL
        WHERE id = $1 AND status = 'PENDING' AND lease_owner = $2
        RETURNING status
      `,
      [
        event.id,
        this.workerId,
        definitive,
        this.config.maxAttempts,
        delayMs,
        redactDeliveryError(result.error),
        result.httpStatus,
      ],
    );
    const status = rows[0]?.status;
    if (!status) return 'LEASE_LOST';

    const fields = {
      layer: 'worker',
      worker: 'outbox',
      eventKey: event.event_key,
      topic: event.topic,
      attempt: event.attempts,
      httpStatus: result.httpStatus,
      error: redactDeliveryError(result.error),
    };
    if (status === 'DEAD') {
      this.logger.error('Evento outbox agotado o rechazado: queda DEAD hasta un replay.', fields);
      return 'DEAD';
    }
    this.logger.warn('Entrega outbox fallida; se reintentará.', { ...fields, delayMs });
    return 'RETRY';
  }
}
