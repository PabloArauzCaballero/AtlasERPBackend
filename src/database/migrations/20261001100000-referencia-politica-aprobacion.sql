-- =====================================================================================
-- Documento contable: referencia de la política que decidió si exigía aprobación (ATL-03 / DEC-10)
-- =====================================================================================
--
-- Hasta aquí el cliente escribía `approval_status` al crear el borrador (por defecto NOT_REQUIRED):
-- la exención la elegía quien creaba el documento. Ahora la decide una política del servidor y cada
-- documento guarda cuál: `approval_policy_ref` (p. ej. ALL_MANUAL_REQUIRE_APPROVAL@1).
--
--   - Una sola columna NULLABLE, aditiva. NO hay backfill: una fila anterior queda con NULL y NO se
--     le fabrica una política ni una aprobación. Publicarla (si es un borrador NOT_REQUIRED sin
--     referencia) lo rechaza el servicio con un diagnóstico explícito; los documentos ya
--     contabilizados no cambian de significado.
--   - Una vez escrita, la referencia no se reescribe (disparador), igual que quién aprobó.
--
-- Idempotente.

ALTER TABLE atlas_accounting.accounting_document
  ADD COLUMN IF NOT EXISTS approval_policy_ref varchar(80);

CREATE OR REPLACE FUNCTION atlas_accounting.fn_block_rewrite_of_approval_policy_ref()
RETURNS trigger AS $$
BEGIN
  IF OLD.approval_policy_ref IS NOT NULL
     AND NEW.approval_policy_ref IS DISTINCT FROM OLD.approval_policy_ref THEN
    RAISE EXCEPTION 'ACCOUNTING_DOCUMENT_APPROVAL_POLICY_REF_IS_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_accounting_document_approval_policy_ref_immutable
  ON atlas_accounting.accounting_document;
CREATE TRIGGER trg_accounting_document_approval_policy_ref_immutable
BEFORE UPDATE ON atlas_accounting.accounting_document
FOR EACH ROW
EXECUTE FUNCTION atlas_accounting.fn_block_rewrite_of_approval_policy_ref();
