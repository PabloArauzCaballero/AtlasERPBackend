-- =====================================================================================
-- Outbox con entrega real, reserva por lease e inbox del consumidor (P-03 · B05, 2026-09-24)
-- =====================================================================================
--
-- Hasta aquí `publishEvent` escribía una línea de log y el worker asignaba `published_at` en la
-- misma transacción: un evento figuraba «publicado» sin que nadie lo hubiera recibido. Esta
-- migración da a la tabla lo que necesita una entrega de verdad:
--
--   * `status`: PENDING (por entregar o en vuelo), PUBLISHED (el receptor confirmó con un 2xx),
--     DEAD (agotó reintentos o el receptor lo rechazó de forma definitiva: visible y reenviable
--     sólo por un replay autorizado) y LEGACY_LOG_ONLY (ver abajo).
--   * Lease: `lease_owner` + `lease_expires_at`. La reserva es una sentencia corta; la llamada de
--     red va FUERA de transacción; si el worker muere, el lease caduca y otro lo retoma.
--   * `attempts`, `next_attempt_at` (backoff exponencial con tope), `last_error` (ya redactado por
--     el worker, nunca el cuerpo ni cabeceras), `last_http_status`, `dead_at`, `replay_count`.
--   * `schema_version` del sobre y `aggregate_version`: orden por agregado. La asigna un trigger
--     al insertar, así que NINGÚN productor tiene que cambiar.
--
-- Filas antiguas con `published_at`: las marcó el worker que sólo escribía un log, así que NO se
-- entregaron a nadie. No se reescribe su `published_at` (es historia), pero se etiquetan
-- LEGACY_LOG_ONLY para que ningún panel las cuente como entregadas. No se reenvían solas: un
-- replay autorizado puede hacerlo. Decisión anotada en docs/compliance/decisions.md (P-03).
--
-- Idempotente: se puede aplicar dos veces.

ALTER TABLE atlas_accounting.event_outbox
  ADD COLUMN IF NOT EXISTS status varchar(20),
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS lease_owner varchar(120),
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error varchar(500),
  ADD COLUMN IF NOT EXISTS last_http_status smallint,
  ADD COLUMN IF NOT EXISTS dead_at timestamptz,
  ADD COLUMN IF NOT EXISTS replay_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS schema_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS aggregate_version bigint;

-- Datos ANTES de los CHECK: primero se etiqueta, después se restringe.
UPDATE atlas_accounting.event_outbox
SET status = CASE WHEN published_at IS NULL THEN 'PENDING' ELSE 'LEGACY_LOG_ONLY' END
WHERE status IS NULL;

WITH numeradas AS (
  SELECT id,
         row_number() OVER (PARTITION BY aggregate_type, aggregate_id ORDER BY id) AS version
  FROM atlas_accounting.event_outbox
  WHERE aggregate_version IS NULL
)
UPDATE atlas_accounting.event_outbox e
SET aggregate_version = n.version
FROM numeradas n
WHERE e.id = n.id;

ALTER TABLE atlas_accounting.event_outbox
  ALTER COLUMN status SET DEFAULT 'PENDING',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN aggregate_version SET NOT NULL;

ALTER TABLE atlas_accounting.event_outbox
  DROP CONSTRAINT IF EXISTS chk_event_outbox_status,
  DROP CONSTRAINT IF EXISTS chk_event_outbox_published_consistent,
  DROP CONSTRAINT IF EXISTS chk_event_outbox_attempts;

ALTER TABLE atlas_accounting.event_outbox
  ADD CONSTRAINT chk_event_outbox_status
    CHECK (status IN ('PENDING', 'PUBLISHED', 'DEAD', 'LEGACY_LOG_ONLY')),
  -- `published_at` sólo existe con un ACK (PUBLISHED) o como historia etiquetada; y un PUBLISHED
  -- sin `published_at` sería una entrega sin fecha.
  ADD CONSTRAINT chk_event_outbox_published_consistent
    CHECK (
      (status = 'PUBLISHED' AND published_at IS NOT NULL)
      OR (status = 'LEGACY_LOG_ONLY' AND published_at IS NOT NULL)
      OR (status IN ('PENDING', 'DEAD') AND published_at IS NULL)
    ),
  ADD CONSTRAINT chk_event_outbox_attempts CHECK (attempts >= 0 AND replay_count >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS uq_event_outbox_aggregate_version
  ON atlas_accounting.event_outbox (aggregate_type, aggregate_id, aggregate_version);

-- La consulta de reserva: pendientes cuyo turno llegó.
CREATE INDEX IF NOT EXISTS idx_event_outbox_claim
  ON atlas_accounting.event_outbox (next_attempt_at, id)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_event_outbox_dead
  ON atlas_accounting.event_outbox (dead_at)
  WHERE status = 'DEAD';

-- Versión de agregado asignada en la base. El candado consultivo es por agregado y dura lo que la
-- transacción del productor: dos transacciones que emiten para el MISMO agregado se serializan y
-- reciben versiones consecutivas en orden de commit; agregados distintos no se esperan.
CREATE OR REPLACE FUNCTION atlas_accounting.event_outbox_assign_aggregate_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.aggregate_version IS NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended('event_outbox:' || NEW.aggregate_type || ':' || NEW.aggregate_id::text, 0)
    );
    SELECT COALESCE(MAX(aggregate_version), 0) + 1
      INTO NEW.aggregate_version
      FROM atlas_accounting.event_outbox
     WHERE aggregate_type = NEW.aggregate_type
       AND aggregate_id = NEW.aggregate_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_outbox_aggregate_version ON atlas_accounting.event_outbox;
CREATE TRIGGER trg_event_outbox_aggregate_version
  BEFORE INSERT ON atlas_accounting.event_outbox
  FOR EACH ROW
  EXECUTE FUNCTION atlas_accounting.event_outbox_assign_aggregate_version();

COMMENT ON COLUMN atlas_accounting.event_outbox.status IS
  'PENDING | PUBLISHED (ACK 2xx del receptor) | DEAD (agotado o rechazado; replay autorizado) | LEGACY_LOG_ONLY (marcado por el worker antiguo que sólo escribía un log: nunca entregado).';
COMMENT ON COLUMN atlas_accounting.event_outbox.published_at IS
  'Momento del ACK duradero del receptor. Nunca se asigna por escribir un log.';
COMMENT ON COLUMN atlas_accounting.event_outbox.last_error IS
  'Error de la última entrega, redactado por el worker (sin cuerpo, cabeceras ni secretos).';
COMMENT ON COLUMN atlas_accounting.event_outbox.aggregate_version IS
  'Versión monótona por (aggregate_type, aggregate_id), asignada por trigger. El consumidor la usa para que una versión vieja no revierta una nueva.';

-- =====================================================================================
-- Inbox del consumidor
-- =====================================================================================
-- La entrega es «al menos una vez»: el mismo evento puede llegar diez veces. El consumidor
-- registra la clave aquí, con unicidad, en la MISMA transacción que aplica el efecto; el segundo
-- intento choca con la clave y no repite el efecto. Ver `src/common/events/event-inbox.ts`.

CREATE TABLE IF NOT EXISTS atlas_accounting.event_inbox (
  id bigserial PRIMARY KEY,
  consumer varchar(80) NOT NULL,
  event_key varchar(160) NOT NULL,
  topic varchar(120) NOT NULL,
  aggregate_type varchar(40),
  aggregate_id varchar(80),
  aggregate_version bigint,
  schema_version integer NOT NULL DEFAULT 1,
  outcome varchar(20) NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_event_inbox_consumer_key UNIQUE (consumer, event_key),
  CONSTRAINT chk_event_inbox_outcome CHECK (outcome IN ('APPLIED', 'STALE'))
);

-- Última versión aplicada por agregado y consumidor: lo que impide que una versión vieja
-- (reentregada tarde o fuera de orden) revierta un estado más nuevo.
CREATE TABLE IF NOT EXISTS atlas_accounting.event_inbox_aggregate (
  consumer varchar(80) NOT NULL,
  aggregate_type varchar(40) NOT NULL,
  aggregate_id varchar(80) NOT NULL,
  last_version bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, aggregate_type, aggregate_id)
);
