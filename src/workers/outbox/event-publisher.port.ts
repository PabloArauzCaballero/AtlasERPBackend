/**
 * Puerto de publicación del outbox (P-03 · B05).
 *
 * El worker sólo conoce esta interfaz. Un adaptador cumple el contrato si y sólo si devuelve
 * `ACK` cuando el receptor confirmó de forma DURADERA (en HTTP: un 2xx después de registrar el
 * evento). Todo lo demás —un log escrito, una petición enviada sin respuesta, un timeout— es
 * `RETRY` o `REJECTED`, y el evento sigue sin `published_at`.
 */

/** Versión del sobre que viaja al receptor. Cambia sólo con un cambio incompatible del sobre. */
export const OUTBOX_ENVELOPE_SPEC = 'atlas.erp.outbox/1';

/** Lo que recibe el consumidor. Estable entre reintentos: el mismo evento produce el mismo sobre. */
export interface OutboxEnvelope {
  spec: typeof OUTBOX_ENVELOPE_SPEC;
  /** Clave única del evento: es la clave de idempotencia que el consumidor guarda en su inbox. */
  eventKey: string;
  topic: string;
  schemaVersion: number;
  aggregate: {
    type: string;
    id: string;
    /** Monótona por agregado: una versión menor nunca debe revertir el efecto de una mayor. */
    version: number;
  };
  occurredAt: string;
  producer: 'atlas-erp';
  payload: unknown;
}

/** Metadatos de ESTA entrega: cambian entre reintentos y por eso no van dentro del sobre. */
export interface DeliveryContext {
  attempt: number;
  /** Portador W3C (`traceparent`, `tracestate`) del span consumidor activo. */
  traceHeaders: Record<string, string>;
}

export type PublishResult =
  | { outcome: 'ACK'; httpStatus: number | null }
  /** Fallo transitorio (red, timeout, 5xx, 408, 429): se reintenta con backoff. */
  | { outcome: 'RETRY'; error: string; httpStatus: number | null }
  /** El receptor rechazó de forma definitiva (4xx): va a DEAD y sólo sale por replay autorizado. */
  | { outcome: 'REJECTED'; error: string; httpStatus: number | null };

export interface EventPublisher {
  publish(envelope: OutboxEnvelope, context: DeliveryContext): Promise<PublishResult>;
}
