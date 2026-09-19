-- =====================================================================================
-- Contexto de traza en el outbox (2026-09-18)
-- =====================================================================================
--
-- El worker de outbox corre en OTRO proceso: la API escribe la fila, hace commit, y segundos o
-- minutos después el worker la reclama. El contexto de OpenTelemetry vive en el almacenamiento
-- asíncrono del proceso y no sobrevive a ese salto, así que hay que persistirlo.
--
-- Por qué una columna y no una clave dentro de `payload`: ese campo es el CONTRATO DE DOMINIO
-- del evento —tiene un índice GIN encima y es lo que saldrá hacia un broker el día que
-- `publishEvent` deje de ser un registro en el log—. Meter ahí el `traceparent` significaría
-- publicar metadatos de transporte como si fueran parte del hecho de negocio, y obligar a
-- cualquier consumidor externo a aprender a ignorarlos.
--
-- Guarda un portador W3C: `{"traceparent": "00-<32hex>-<16hex>-<2hex>", "tracestate": "..."}`.
-- Nunca datos de negocio.
--
-- ADITIVA y sin UPDATE: no reescribe una sola fila. Las filas existentes quedan con `NULL`, y el
-- worker las procesa igual abriendo su propia traza raíz —la compatibilidad hacia atrás es por
-- construcción—. Idempotente: se puede aplicar dos veces.

ALTER TABLE atlas_accounting.event_outbox
  ADD COLUMN IF NOT EXISTS trace_context jsonb;

COMMENT ON COLUMN atlas_accounting.event_outbox.trace_context IS
  'Portador W3C del contexto de traza (traceparent/tracestate). Lo escribe la API al publicar y lo lee el worker al reclamar. Sin datos de negocio.';
