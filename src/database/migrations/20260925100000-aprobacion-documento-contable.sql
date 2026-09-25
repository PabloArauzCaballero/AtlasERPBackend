-- =====================================================================================
-- Documento contable: quién lo aprobó o rechazó, y listados paginados por entidad (ATL-03 / ATL-05)
-- =====================================================================================
--
-- Hasta aquí `approval_status` lo escribía el cliente al crear el borrador y nada lo cambiaba: se
-- podía mandar APPROVED y autocertificarse, y PENDING o REJECTED se contabilizaban igual. Ahora la
-- transición PENDING → APPROVED | REJECTED la hace el servidor (PATCH /accounting/documents/:id/
-- approve | reject) con un actor distinto del creador, y esta migración guarda quién y cuándo.
--
--   1. Cuatro columnas NULLABLE: `approved_by/approved_at`, `rejected_by/rejected_at`. Ninguna fila
--      existente cambia: no hay backfill (la política de quién debe aprobar es DEC-10, pendiente).
--   2. La decisión, una vez escrita, no se reescribe (disparador): ni otro aprobador ni otra fecha.
--   3. Índices para el listado: filtrar por entidad y ordenar por fecha e id ANTES del LIMIT.
--
-- Idempotente. Los índices no son CONCURRENTLY porque el ejecutor aplica el archivo entero en una
-- sola llamada; con el volumen actual la tabla se indexa en milisegundos.

ALTER TABLE atlas_accounting.accounting_document
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

CREATE OR REPLACE FUNCTION atlas_accounting.fn_block_rewrite_of_document_approval()
RETURNS trigger AS $$
BEGIN
  IF (OLD.approved_by IS NOT NULL OR OLD.approved_at IS NOT NULL)
     AND (NEW.approved_by IS DISTINCT FROM OLD.approved_by
          OR NEW.approved_at IS DISTINCT FROM OLD.approved_at) THEN
    RAISE EXCEPTION 'ACCOUNTING_DOCUMENT_APPROVAL_IS_IMMUTABLE';
  END IF;
  IF (OLD.rejected_by IS NOT NULL OR OLD.rejected_at IS NOT NULL)
     AND (NEW.rejected_by IS DISTINCT FROM OLD.rejected_by
          OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at) THEN
    RAISE EXCEPTION 'ACCOUNTING_DOCUMENT_APPROVAL_IS_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_accounting_document_approval_immutable
  ON atlas_accounting.accounting_document;
CREATE TRIGGER trg_accounting_document_approval_immutable
BEFORE UPDATE ON atlas_accounting.accounting_document
FOR EACH ROW
EXECUTE FUNCTION atlas_accounting.fn_block_rewrite_of_document_approval();

CREATE INDEX IF NOT EXISTS idx_accounting_document_entity_date_id
  ON atlas_accounting.accounting_document (legal_entity_id, document_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_accounting_document_date_id
  ON atlas_accounting.accounting_document (document_date DESC, id DESC);
