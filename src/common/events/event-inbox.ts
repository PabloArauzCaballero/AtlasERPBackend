/**
 * Inbox del consumidor de eventos (P-03 · B05).
 *
 * La entrega del outbox es «al menos una vez»: el mismo evento puede llegar diez veces (reintento
 * tras un timeout, caída entre el ACK y la marca de publicado, replay autorizado). El EFECTO tiene
 * que ser uno. Regla de uso:
 *
 *   await inPgTransaction(client, (tx) =>
 *     consumeOnce(tx, { consumer: 'mi-servicio', event }, async (tx) => { …efecto con tx… }),
 *   );
 *
 * La clave se registra con unicidad (`consumer`, `event_key`) en la MISMA transacción que el
 * efecto. Si el efecto falla, se revierte también la clave y el reintento vuelve a aplicarlo; si
 * la transacción confirma, cualquier repetición choca con la clave y no hace nada. Dos entregas
 * simultáneas del mismo evento se serializan en la unicidad: la segunda espera a la primera y,
 * cuando ésta confirma, ve la clave y devuelve DUPLICATE.
 *
 * Orden por agregado: con `ordering: 'latest-state'` el helper recuerda la última versión aplicada
 * por agregado y descarta (STALE) una versión menor o igual que llegue después, para que un evento
 * viejo reentregado no revierta un estado más nuevo. Con `'every-event'` cada evento distinto se
 * aplica una vez sin importar el orden: es el modo de los efectos que SUMAN (una obligación por
 * evento), donde descartar un evento por llegar tarde perdería dinero.
 *
 * El receptor HTTP debe responder 2xx SÓLO después de que esta transacción confirme: ese 2xx es
 * el ACK duradero que marca el evento como publicado en el ERP.
 */
import type { Queryable } from './queryable';

export type InboxOrdering = 'every-event' | 'latest-state';

export interface InboxEvent {
  eventKey: string;
  topic: string;
  schemaVersion?: number;
  aggregate?: { type: string; id: string; version: number } | null;
}

export type InboxResult<T> =
  | { status: 'APPLIED'; value: T }
  | { status: 'DUPLICATE' }
  | { status: 'STALE'; lastVersion: number };

export interface ConsumeOnceInput {
  /** Nombre estable del consumidor: dos consumidores distintos pueden aplicar el mismo evento. */
  consumer: string;
  event: InboxEvent;
  ordering?: InboxOrdering;
}

/**
 * Debe llamarse DENTRO de una transacción abierta sobre `tx`: la unicidad sólo protege el efecto
 * si ambos confirman o se revierten juntos.
 */
export async function consumeOnce<T>(
  tx: Queryable,
  input: ConsumeOnceInput,
  effect: (tx: Queryable) => Promise<T>,
): Promise<InboxResult<T>> {
  const { consumer, event } = input;
  const ordering = input.ordering ?? 'every-event';
  if (ordering === 'latest-state' && !event.aggregate) {
    throw new Error('consumeOnce: el orden latest-state exige la versión del agregado.');
  }

  const inserted = await tx.query<{ id: string }>(
    `
      INSERT INTO atlas_accounting.event_inbox
        (consumer, event_key, topic, aggregate_type, aggregate_id, aggregate_version,
         schema_version, outcome)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'APPLIED')
      ON CONFLICT (consumer, event_key) DO NOTHING
      RETURNING id::text AS id
    `,
    [
      consumer,
      event.eventKey,
      event.topic,
      event.aggregate?.type ?? null,
      event.aggregate?.id ?? null,
      event.aggregate?.version ?? null,
      event.schemaVersion ?? 1,
    ],
  );
  if (inserted.rows.length === 0) return { status: 'DUPLICATE' };

  if (ordering === 'latest-state' && event.aggregate) {
    // Upsert condicional: sólo avanza si la versión nueva es MAYOR. El candado de fila serializa
    // dos versiones del mismo agregado que lleguen a la vez.
    const advanced = await tx.query<{ last_version: string }>(
      `
        INSERT INTO atlas_accounting.event_inbox_aggregate
          (consumer, aggregate_type, aggregate_id, last_version)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (consumer, aggregate_type, aggregate_id) DO UPDATE
          SET last_version = EXCLUDED.last_version, updated_at = now()
          WHERE atlas_accounting.event_inbox_aggregate.last_version < EXCLUDED.last_version
        RETURNING last_version::text AS last_version
      `,
      [consumer, event.aggregate.type, event.aggregate.id, event.aggregate.version],
    );
    if (advanced.rows.length === 0) {
      const current = await tx.query<{ last_version: string }>(
        `
          SELECT last_version::text AS last_version
          FROM atlas_accounting.event_inbox_aggregate
          WHERE consumer = $1 AND aggregate_type = $2 AND aggregate_id = $3
        `,
        [consumer, event.aggregate.type, event.aggregate.id],
      );
      await tx.query(
        `UPDATE atlas_accounting.event_inbox SET outcome = 'STALE'
         WHERE consumer = $1 AND event_key = $2`,
        [consumer, event.eventKey],
      );
      return { status: 'STALE', lastVersion: Number(current.rows[0]?.last_version ?? 0) };
    }
  }

  const value = await effect(tx);
  return { status: 'APPLIED', value };
}
