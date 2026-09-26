import { outboxConsumerAttributes } from '../../common/observability/messaging-attributes';
import type { MessagingTraceService } from '../../common/observability/messaging-trace.service';
import { SPAN_NAMES } from '../../observability/telemetry.constants';
import type { DeliveryTracer } from './outbox-relay';

/**
 * Cada entrega corre en un span CONSUMIDOR enlazado con quien publicó el evento.
 *
 * Es el único punto del ERP donde la traza cruza de un proceso a otro: el contexto murió con el
 * commit de la API y aquí se RECONSTRUYE desde `trace_context`. El portador del span activo viaja
 * al receptor en `traceparent`/`tracestate`, así que la traza continúa también en el consumidor.
 * Una fila sin portador abre su propia traza y se entrega igual.
 */
export function createOtelDeliveryTracer(messaging: MessagingTraceService): DeliveryTracer {
  return (event, operation) =>
    messaging.runAsConsumer(
      SPAN_NAMES.outboxDispatch,
      event.trace_context,
      outboxConsumerAttributes({
        eventType: event.topic,
        aggregateType: event.aggregate_type,
        aggregateId: event.aggregate_id,
        attempt: event.attempts,
      }),
      () => operation(messaging.inject()),
    );
}
