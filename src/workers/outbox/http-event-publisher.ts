/**
 * Adaptador HTTP firmado del outbox (P-03 · B05).
 *
 * Por qué HTTP y no un broker: el equipo no opera Kafka/SNS/RabbitMQ en ningún entorno, y los
 * servicios de Atlas ya se hablan por HTTP servicio-a-servicio. El ACK duradero es la respuesta
 * 2xx del receptor, que SÓLO debe responderla después de registrar el evento en su inbox (ver
 * `src/common/events/event-inbox.ts`). La entrega es «al menos una vez»; la unicidad del efecto la
 * pone la inbox del consumidor.
 *
 * Firma: `x-atlas-signature: t=<unix>,v1=<hex(HMAC-SHA256(secret, "<t>.<cuerpo crudo>"))>`. El
 * receptor recalcula con el cuerpo CRUDO (no re-serializado) y rechaza firmas fuera de ventana.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  DeliveryContext,
  EventPublisher,
  OutboxEnvelope,
  PublishResult,
} from './event-publisher.port';

export const SIGNATURE_HEADER = 'x-atlas-signature';
export const EVENT_KEY_HEADER = 'x-atlas-event-key';
export const TOPIC_HEADER = 'x-atlas-topic';
export const ATTEMPT_HEADER = 'x-atlas-delivery-attempt';
export const DEFAULT_SIGNATURE_TOLERANCE_SECONDS = 300;

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface HttpEventPublisherOptions {
  url: string;
  signingSecret: string;
  timeoutMs: number;
  /** Inyectable para pruebas; por defecto el `fetch` global de Node 22. */
  fetchImpl?: FetchLike;
  /** Reloj inyectable para pruebas de firma. */
  nowSeconds?: () => number;
}

/**
 * Códigos que dicen «este evento, tal cual, no se aceptará nunca»: reintentarlo no cambia nada, así
 * que va a DEAD y queda visible para un replay autorizado. 401/403/404 NO están: son casi siempre
 * configuración (secreto rotado, receptor aún no desplegado) y se arreglan sin tocar el evento.
 */
const REJECTED_STATUSES = new Set([400, 410, 413, 415, 422]);

export function signOutboxBody(secret: string, rawBody: string, timestampSeconds: number): string {
  const digest = createHmac('sha256', secret)
    .update(`${timestampSeconds}.${rawBody}`)
    .digest('hex');
  return `t=${timestampSeconds},v1=${digest}`;
}

/**
 * Verificación para el RECEPTOR. Comparación en tiempo constante y ventana de frescura contra
 * repeticiones de una petición capturada.
 */
export function verifyOutboxSignature(input: {
  secret: string;
  header: string | undefined | null;
  rawBody: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): boolean {
  if (!input.header) return false;
  const parts = new Map(
    input.header.split(',').map((part) => {
      const [key, ...rest] = part.trim().split('=');
      return [key, rest.join('=')] as const;
    }),
  );
  const timestamp = Number(parts.get('t'));
  const received = parts.get('v1');
  if (!Number.isInteger(timestamp) || !received || !/^[0-9a-f]{64}$/.test(received)) return false;

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? DEFAULT_SIGNATURE_TOLERANCE_SECONDS;
  if (Math.abs(now - timestamp) > tolerance) return false;

  const expected = createHmac('sha256', input.secret)
    .update(`${timestamp}.${input.rawBody}`)
    .digest();
  return timingSafeEqual(expected, Buffer.from(received, 'hex'));
}

/**
 * Error apto para guardar en `last_error` y en logs: sin cuerpo de respuesta, sin cabeceras, sin
 * credenciales de URL ni query string, sin el secreto, y truncado.
 */
export function redactDeliveryError(message: string, secret?: string): string {
  let redacted = message.replace(/(https?:\/\/)([^\s/]*@)?([^\s/?#]+)[^\s]*/gi, '$1$3/…');
  if (secret) redacted = redacted.split(secret).join('[secreto]');
  redacted = redacted
    .replace(/(authorization|x-atlas-signature)[^\s;]*/gi, '$1=[redactado]')
    .replace(/\bv1=[0-9a-f]+/gi, 'v1=[redactado]');
  return redacted.slice(0, 300);
}

export class HttpEventPublisher implements EventPublisher {
  private readonly fetchImpl: FetchLike;
  private readonly nowSeconds: () => number;

  constructor(private readonly options: HttpEventPublisherOptions) {
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
    this.nowSeconds = options.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  }

  async publish(envelope: OutboxEnvelope, context: DeliveryContext): Promise<PublishResult> {
    const rawBody = JSON.stringify(envelope);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      [EVENT_KEY_HEADER]: envelope.eventKey,
      [TOPIC_HEADER]: envelope.topic,
      [ATTEMPT_HEADER]: String(context.attempt),
      [SIGNATURE_HEADER]: signOutboxBody(this.options.signingSecret, rawBody, this.nowSeconds()),
      // Sólo las dos cabeceras W3C: un portador manipulado en la fila no puede pisar la firma
      // ni la clave del evento.
      ...pickTraceHeaders(context.traceHeaders),
    };

    let response: Response;
    try {
      response = await this.fetchImpl(this.options.url, {
        method: 'POST',
        headers,
        body: rawBody,
        redirect: 'manual',
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      return { outcome: 'RETRY', error: this.describeNetworkError(error), httpStatus: null };
    }

    // El cuerpo no se lee más que para liberar el socket: nunca se guarda (puede traer datos).
    await response.body?.cancel().catch(() => undefined);

    if (response.status >= 200 && response.status < 300) {
      return { outcome: 'ACK', httpStatus: response.status };
    }
    const error = `HTTP ${response.status} del receptor`;
    if (REJECTED_STATUSES.has(response.status)) {
      return { outcome: 'REJECTED', error, httpStatus: response.status };
    }
    return { outcome: 'RETRY', error, httpStatus: response.status };
  }

  private describeNetworkError(error: unknown): string {
    // Sin `instanceof`: los errores de `fetch` (undici, DOMException) pueden venir de otro realm.
    // A veces el TimeoutError llega tal cual y a veces envuelto en `cause`.
    const top = asErrorLike(error);
    const cause = asErrorLike(top?.cause);
    if ([top?.name, cause?.name].some((n) => n === 'TimeoutError' || n === 'AbortError')) {
      return `timeout: sin respuesta del receptor en ${this.options.timeoutMs} ms`;
    }
    const detail = cause
      ? `${cause.name ?? 'Error'}: ${cause.code ?? cause.message ?? ''}`
      : (top?.message ?? String(error));
    return redactDeliveryError(`red: ${detail}`, this.options.signingSecret);
  }
}

interface ErrorLike {
  name?: string;
  message?: string;
  code?: string;
  cause?: unknown;
}

function asErrorLike(value: unknown): ErrorLike | undefined {
  return typeof value === 'object' && value !== null ? (value as ErrorLike) : undefined;
}

function pickTraceHeaders(carrier: Record<string, string>): Record<string, string> {
  const picked: Record<string, string> = {};
  if (carrier.traceparent) picked.traceparent = carrier.traceparent;
  if (carrier.tracestate) picked.tracestate = carrier.tracestate;
  return picked;
}
