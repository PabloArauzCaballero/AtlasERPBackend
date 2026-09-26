-- =====================================================================================
-- Cobertura BNPL: la cola de revisión se RESUELVE, con actor, motivo y fecha (P-04 / P-05)
-- =====================================================================================
--
-- 20260924200000 abrió la cola `coverage_review_items` (avisos de pago sin verificar a tiempo,
-- coberturas pedidas sobre una cuota con aviso pendiente, contrato no activo) pero no daba forma
-- de cerrarla: un aviso REPORTED quedaba en la cola para siempre y la cuota no se podía ni dar
-- por pagada ni cubrir. Esta migración añade lo que la resolución necesita:
--
--   1. `consumer_payments_to_merchant`: quién decidió el aviso (confirmado o rechazado), cuándo y
--      con qué nota. Un aviso decidido guarda su decisión en la misma fila.
--   2. `coverage_review_items.resolution`: CÓMO se cerró (cobertura programada, aviso confirmado,
--      aviso rechazado, descartado). Un elemento cerrado exige desenlace, actor, fecha y motivo.
--   3. Historia inmutable: un elemento de la cola no se borra, y uno cerrado no se edita.
--
-- Todo es AÑADIR: ninguna fila existente cambia de valor. Idempotente: se puede aplicar dos veces.

-- 1. Decisión del aviso de pago -------------------------------------------------------------------
ALTER TABLE atlas_sales.consumer_payments_to_merchant
  ADD COLUMN IF NOT EXISTS decided_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS decision_note varchar(240);

-- 2. Desenlace de la revisión ---------------------------------------------------------------------
ALTER TABLE atlas_sales.coverage_review_items
  ADD COLUMN IF NOT EXISTS resolution varchar(30);

ALTER TABLE atlas_sales.coverage_review_items
  DROP CONSTRAINT IF EXISTS ck_coverage_review_resolution_kind,
  ADD CONSTRAINT ck_coverage_review_resolution_kind CHECK (
    resolution IS NULL
    OR resolution IN ('COVERAGE_SCHEDULED', 'NOTICE_CONFIRMED', 'NOTICE_REJECTED', 'DISMISSED')
  );

-- NOT VALID: las filas cerradas antes de esta migración (por una cobertura programada) no tienen
-- `resolution`; se conservan como están. Todo cierre nuevo lleva desenlace, actor y motivo.
ALTER TABLE atlas_sales.coverage_review_items
  DROP CONSTRAINT IF EXISTS ck_coverage_review_closed_audit,
  ADD CONSTRAINT ck_coverage_review_closed_audit CHECK (
    status = 'OPEN'
    OR (
      resolution IS NOT NULL
      AND resolved_by_user_id IS NOT NULL
      AND resolved_at IS NOT NULL
      AND length(btrim(coalesce(resolution_note, ''))) >= 3
    )
  ) NOT VALID;

-- 3. Historia inmutable ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION atlas_sales.fn_coverage_review_items_history()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'coverage_review_items no se borra: un elemento se cierra con desenlace y motivo'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status <> 'OPEN' THEN
    RAISE EXCEPTION 'coverage_review_items: el elemento % ya está cerrado y no se edita', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_coverage_review_items_history ON atlas_sales.coverage_review_items;
CREATE TRIGGER trg_coverage_review_items_history
  BEFORE UPDATE OR DELETE ON atlas_sales.coverage_review_items
  FOR EACH ROW EXECUTE FUNCTION atlas_sales.fn_coverage_review_items_history();

CREATE INDEX IF NOT EXISTS idx_coverage_review_items_status
  ON atlas_sales.coverage_review_items (status, opened_at);
