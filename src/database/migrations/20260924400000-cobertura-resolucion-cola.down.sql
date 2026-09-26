-- Reversa de 20260924400000-cobertura-resolucion-cola.sql
--
-- NO destruye hechos: si algún aviso de pago ya tiene decisión registrada o algún elemento de la
-- cola se cerró con desenlace, la reversa se NIEGA y no toca nada. Quitar esas columnas borraría
-- quién confirmó o rechazó un pago y por qué; eso lo decide una persona, no un guion.

DO $$
BEGIN
  IF EXISTS (
       SELECT 1 FROM atlas_sales.consumer_payments_to_merchant
       WHERE decided_by_user_id IS NOT NULL OR decided_at IS NOT NULL
     )
     OR EXISTS (SELECT 1 FROM atlas_sales.coverage_review_items WHERE resolution IS NOT NULL) THEN
    RAISE EXCEPTION
      'Reversa rechazada: hay avisos de pago decididos o revisiones cerradas con desenlace.';
  END IF;
END $$;

DROP INDEX IF EXISTS atlas_sales.idx_coverage_review_items_status;
DROP TRIGGER IF EXISTS trg_coverage_review_items_history ON atlas_sales.coverage_review_items;
DROP FUNCTION IF EXISTS atlas_sales.fn_coverage_review_items_history();

ALTER TABLE atlas_sales.coverage_review_items
  DROP CONSTRAINT IF EXISTS ck_coverage_review_closed_audit,
  DROP CONSTRAINT IF EXISTS ck_coverage_review_resolution_kind,
  DROP COLUMN IF EXISTS resolution;

ALTER TABLE atlas_sales.consumer_payments_to_merchant
  DROP COLUMN IF EXISTS decision_note,
  DROP COLUMN IF EXISTS decided_at,
  DROP COLUMN IF EXISTS decided_by_user_id;
