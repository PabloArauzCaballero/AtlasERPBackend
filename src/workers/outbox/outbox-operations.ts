/**
 * Operación del outbox: estado de la cola, eventos agotados y replay autorizado (P-03).
 *
 * Funciones puras sobre `Queryable` para que la ruta de Nest y las pruebas contra PostgreSQL
 * ejecuten exactamente el mismo SQL. La autorización (rol) y el registro de auditoría viven en el
 * servicio de Nest que las llama; aquí no se decide quién puede.
 */
import type { Queryable } from '../../common/events/queryable';

const T = 'atlas_accounting.event_outbox';

export type OutboxStatus = 'PENDING' | 'PUBLISHED' | 'DEAD' | 'LEGACY_LOG_ONLY';

export interface OutboxStatusReport {
  counts: Record<OutboxStatus, number>;
  /** Pendientes con un lease vivo: un worker los tiene en la mano ahora mismo. */
  inFlight: number;
  oldestPendingAgeSeconds: number | null;
  maxPendingAttempts: number;
}

export interface DeadOutboxEvent {
  eventKey: string;
  topic: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  attempts: number;
  lastError: string | null;
  lastHttpStatus: number | null;
  deadAt: string | null;
  replayCount: number;
  createdAt: string;
}

export async function readOutboxStatus(db: Queryable): Promise<OutboxStatusReport> {
  const { rows } = await db.query<{
    status: OutboxStatus;
    total: string;
    in_flight: string;
    oldest_age: string | null;
    max_attempts: number | null;
  }>(
    `
      SELECT status,
             count(*)::text AS total,
             count(*) FILTER (WHERE lease_expires_at > now())::text AS in_flight,
             floor(extract(epoch FROM now() - min(created_at)))::text AS oldest_age,
             max(attempts) AS max_attempts
      FROM ${T}
      GROUP BY status
    `,
  );
  const counts: Record<OutboxStatus, number> = {
    PENDING: 0,
    PUBLISHED: 0,
    DEAD: 0,
    LEGACY_LOG_ONLY: 0,
  };
  let inFlight = 0;
  let oldestPendingAgeSeconds: number | null = null;
  let maxPendingAttempts = 0;
  for (const row of rows) {
    counts[row.status] = Number(row.total);
    if (row.status === 'PENDING') {
      inFlight = Number(row.in_flight);
      oldestPendingAgeSeconds = row.oldest_age === null ? null : Number(row.oldest_age);
      maxPendingAttempts = Number(row.max_attempts ?? 0);
    }
  }
  return { counts, inFlight, oldestPendingAgeSeconds, maxPendingAttempts };
}

export async function listDeadEvents(db: Queryable, limit: number): Promise<DeadOutboxEvent[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `
      SELECT event_key, topic, aggregate_type, aggregate_id::text AS aggregate_id,
             aggregate_version::text AS aggregate_version, attempts, last_error, last_http_status,
             dead_at, replay_count, created_at
      FROM ${T}
      WHERE status = 'DEAD'
      ORDER BY dead_at ASC NULLS LAST, id ASC
      LIMIT $1
    `,
    [limit],
  );
  return rows.map((row) => ({
    eventKey: String(row.event_key),
    topic: String(row.topic),
    aggregateType: String(row.aggregate_type),
    aggregateId: String(row.aggregate_id),
    aggregateVersion: Number(row.aggregate_version),
    attempts: Number(row.attempts),
    lastError: (row.last_error as string | null) ?? null,
    lastHttpStatus: (row.last_http_status as number | null) ?? null,
    deadAt: row.dead_at ? new Date(row.dead_at as string).toISOString() : null,
    replayCount: Number(row.replay_count),
    createdAt: new Date(row.created_at as string).toISOString(),
  }));
}

export type ReplayResult =
  | {
      outcome: 'REPLAYED';
      eventKey: string;
      previousStatus: 'DEAD' | 'LEGACY_LOG_ONLY';
      previousAttempts: number;
      previousPublishedAt: string | null;
      replayCount: number;
      aggregateType: string;
      aggregateId: string;
    }
  | { outcome: 'NOT_FOUND' }
  | { outcome: 'NOT_REPLAYABLE'; status: OutboxStatus };

/**
 * Devuelve a PENDING un evento DEAD (o LEGACY_LOG_ONLY: marcado «publicado» por el worker antiguo
 * sin haberse entregado nunca). Reinicia intentos y backoff; conserva `replay_count`. Un evento
 * PENDING o PUBLISHED no se toca: reenviar lo ya confirmado sólo lo decide el consumidor.
 *
 * Debe llamarse dentro de una transacción: bloquea la fila para que dos replays simultáneos no
 * cuenten dos veces.
 */
export async function replayEvent(db: Queryable, eventKey: string): Promise<ReplayResult> {
  const current = await db.query<{
    status: OutboxStatus;
    attempts: number;
    published_at: Date | null;
  }>(`SELECT status, attempts, published_at FROM ${T} WHERE event_key = $1 FOR UPDATE`, [eventKey]);
  const row = current.rows[0];
  if (!row) return { outcome: 'NOT_FOUND' };
  if (row.status !== 'DEAD' && row.status !== 'LEGACY_LOG_ONLY') {
    return { outcome: 'NOT_REPLAYABLE', status: row.status };
  }

  const updated = await db.query<{
    replay_count: number;
    aggregate_type: string;
    aggregate_id: string;
  }>(
    `
      UPDATE ${T}
      SET status = 'PENDING', published_at = NULL, dead_at = NULL,
          attempts = 0, next_attempt_at = now(),
          lease_owner = NULL, lease_expires_at = NULL,
          replay_count = replay_count + 1
      WHERE event_key = $1
      RETURNING replay_count, aggregate_type, aggregate_id::text AS aggregate_id
    `,
    [eventKey],
  );
  const after = updated.rows[0];
  if (!after)
    throw new Error(`replayEvent: la fila ${eventKey} desapareció bajo su propio candado.`);
  return {
    outcome: 'REPLAYED',
    eventKey,
    previousStatus: row.status,
    previousAttempts: Number(row.attempts),
    previousPublishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    replayCount: Number(after.replay_count),
    aggregateType: after.aggregate_type,
    aggregateId: after.aggregate_id,
  };
}
