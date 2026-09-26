-- Reversa de 20260925100000-aprobacion-documento-contable.sql
--
-- NO destruye hechos: si algún documento ya tiene una aprobación o un rechazo registrados, la
-- reversa se NIEGA y no toca nada. Quitar esas columnas borraría quién autorizó un asiento.

DO $$
BEGIN
  IF EXISTS (
       SELECT 1 FROM atlas_accounting.accounting_document
       WHERE approved_by IS NOT NULL OR approved_at IS NOT NULL
          OR rejected_by IS NOT NULL OR rejected_at IS NOT NULL
     ) THEN
    RAISE EXCEPTION
      'Reversa rechazada: hay documentos contables con aprobación o rechazo registrados.';
  END IF;
END $$;

DROP INDEX IF EXISTS atlas_accounting.idx_accounting_document_date_id;
DROP INDEX IF EXISTS atlas_accounting.idx_accounting_document_entity_date_id;
DROP TRIGGER IF EXISTS trg_accounting_document_approval_immutable
  ON atlas_accounting.accounting_document;
DROP FUNCTION IF EXISTS atlas_accounting.fn_block_rewrite_of_document_approval();

ALTER TABLE atlas_accounting.accounting_document
  DROP COLUMN IF EXISTS rejected_at,
  DROP COLUMN IF EXISTS rejected_by,
  DROP COLUMN IF EXISTS approved_at,
  DROP COLUMN IF EXISTS approved_by;
