/**
 * @file Constantes de la capa de observabilidad: nombres de span, atributos y exclusiones.
 * @business Esta pieza reduce el tiempo de detección y recuperación de incidentes.
 * @system centraliza los identificadores que productor y consumidor deben compartir literalmente.
 */

/**
 * Un nombre de span o de atributo divergente entre productor y consumidor rompe la lectura de
 * la traza SIN producir ningún error, así que existen una sola vez y aquí.
 */

/** Emisor de trazas. Identifica el origen de los spans manuales en Jaeger. */
export const TRACER_NAME = 'atlas-erp';

/** Namespace por defecto: agrupa API y workers bajo el mismo producto en el grafo de servicios. */
export const DEFAULT_SERVICE_NAMESPACE = 'atlas';

/**
 * Sufijos de ruta que nunca generan trazas. Son sondas de infraestructura: se consultan cada
 * pocos segundos y no describen ninguna operación de negocio, así que dominarían el volumen sin
 * aportar un solo diagnóstico.
 *
 * Se comparan como SUFIJO y no por igualdad porque el prefijo global `api/v1` es configurable:
 * las sondas viven en `/api/v1/health` y `/api/v1/ready`, y una comparación exacta dejaría de
 * funcionar en cuanto alguien cambiara `API_GLOBAL_PREFIX`.
 */
export const UNTRACED_HTTP_PATH_SUFFIXES: readonly string[] = [
  '/health',
  '/ready',
  '/health/live',
  '/health/liveness',
  '/health/ready',
  '/health/readiness',
  '/healthz',
  '/ready',
  '/readiness',
  '/liveness',
  '/metrics',
  '/favicon.ico',
];

/**
 * Clave del portador dentro de la columna `trace_context`.
 *
 * El portador NO va dentro de `payload`: ese campo es el contrato de dominio del evento, tiene
 * un índice GIN encima y es lo que saldrá hacia un broker el día que `publishEvent` deje de ser
 * un registro en el log. El transporte se guarda separado del contenido.
 */
export const TRACE_CARRIER_KEY = 'otel';

/** Cabecera de respuesta con el identificador de traza para soporte técnico. */
export const TRACE_ID_HEADER = 'x-trace-id';

/**
 * Nombres de span de negocio: `<dominio>.<acción>`, estables y SIN identificadores.
 * Un nombre construido con un id crea una serie por ejecución e inutiliza toda agregación.
 */
export const SPAN_NAMES = {
  /** Creación del borrador contable con su asiento, dentro de la transacción del llamante. */
  accountingDocumentDraft: 'accounting.document.draft',
  /** Contabilización de un documento: el asiento y su publicación en el outbox. */
  accountingDocumentPost: 'accounting.document.post',
  /** Publicación de un hecho de dominio en el outbox transaccional. */
  outboxPublish: 'outbox.publish',
  /** Reclamo y despacho de una fila del outbox por el worker. */
  outboxDispatch: 'outbox.dispatch',
  /** Una tanda de un procesador periódico: traza RAÍZ, no cuelga de ninguna petición. */
  jobRun: 'job.run',
} as const;

/**
 * Atributos de decisión. Todos de cardinalidad ACOTADA: el desenlace pertenece a una lista
 * cerrada y el motivo a un catálogo. Nunca el importe, el plazo ni la identidad del solicitante.
 */
export const DECISION_ATTRIBUTES = {
  outcome: 'decision.outcome',
  reason: 'decision.reason',
} as const;

/**
 * Atributos propios, con namespace `app.*` para no colisionar con las convenciones semánticas.
 * Ninguno admite documentos de identidad, montos, nombres ni secretos:
 * ver `docs/observability/04-data-privacy-policy.md`.
 */
export const APP_ATTRIBUTES = {
  module: 'app.module',
  operation: 'app.operation',
  tenantId: 'app.tenant.id',
  entityType: 'app.entity.type',
  entityId: 'app.entity.id',
  jobName: 'app.job.name',
  jobAttempt: 'app.job.attempt',
  jobOutcome: 'app.job.outcome',
  jobProcessed: 'app.job.processed.count',
  eventType: 'app.event.type',
  errorRetryable: 'app.error.retryable',
} as const;

/**
 * `messaging.system` del outbox transaccional. No hay broker: el transporte es la propia tabla,
 * y decirlo así es más honesto que reutilizar el nombre de una cola que no existe.
 */
export const MESSAGING_SYSTEM = 'atlas-erp-outbox';

/** `messaging.destination.name`: la tabla que hace de destino. */
export const MESSAGING_DESTINATION = 'atlas_accounting.event_outbox';

/**
 * Claves de mensajería de las convenciones semánticas, escritas literalmente.
 *
 * El paquete `@opentelemetry/semantic-conventions` las exporta bajo el subpath `/incubating`, que
 * sólo resuelve con `moduleResolution: node16|nodenext`. `tsconfig.spec.json` compila con `Node`
 * clásico, así que importarlas de ahí hacía fallar `type-check:tests` con un error que no habla de
 * lo que pasa. Son cadenas estables del estándar y se declaran aquí, en el único sitio donde
 * productor y consumidor las comparten.
 */
export const MESSAGING_ATTRIBUTES = {
  system: 'messaging.system',
  destinationName: 'messaging.destination.name',
  operationType: 'messaging.operation.type',
} as const;
