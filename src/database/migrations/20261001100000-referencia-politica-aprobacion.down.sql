-- Reversa de 20261001100000-referencia-politica-aprobacion.sql
--
-- NO destruye evidencia: si algún documento ya guarda una referencia de política, la reversa se
-- NIEGA y no toca nada (quitar la columna borraría bajo qué regla se eximió o exigió una aprobación).
-- Sólo sirve en una base descartable o antes de que se haya creado ningún documento nuevo.

DO $$
BEGIN
  IF EXISTS (
       SELECT 1 FROM atlas_accounting.accounting_document WHERE approval_policy_ref IS NOT NULL
     ) THEN
    RAISE EXCEPTION
      'Reversa rechazada: hay documentos contables con referencia de política de aprobación.';
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_accounting_document_approval_policy_ref_immutable
  ON atlas_accounting.accounting_document;
DROP FUNCTION IF EXISTS atlas_accounting.fn_block_rewrite_of_approval_policy_ref();
ALTER TABLE atlas_accounting.accounting_document DROP COLUMN IF EXISTS approval_policy_ref;
