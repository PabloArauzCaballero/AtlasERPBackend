-- Revierte sólo índices: ningún documento, asiento ni enlace se toca.
DROP INDEX IF EXISTS atlas_accounting.uq_accounting_document_merchant_invoice_origin;
DROP INDEX IF EXISTS atlas_sales.uq_merchant_invoices_accounting_document;
DROP INDEX IF EXISTS atlas_accounting.idx_journal_entry_journal_no;
DROP INDEX IF EXISTS atlas_accounting.uq_journal_entry_document;
-- La unicidad global de journal_no sólo vuelve si los datos la cumplen (con dos empresas
-- numerando, normalmente ya no): si no, se deja sin ella en vez de fallar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'journal_entry_journal_no_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM atlas_accounting.journal_entry GROUP BY journal_no HAVING count(*) > 1
  ) THEN
    ALTER TABLE atlas_accounting.journal_entry
      ADD CONSTRAINT journal_entry_journal_no_key UNIQUE (journal_no);
  END IF;
END $$;
