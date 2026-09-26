-- P-06 (2026-09-24) · Un documento contable por factura de comercio, y un asiento por documento.
--
-- 1. `uq_accounting_document_merchant_invoice_origin`: la clave de integración de la factura de
--    comercio es (CRM, MERCHANT_INVOICE, id de la factura), SIN el libro. La restricción heredada
--    (source_system, source_type, source_id, ledger_id) dejaba contabilizar la misma factura una vez
--    por libro, y el puente sólo guarda un documento por factura: el segundo quedaba huérfano.
-- 2. `uq_merchant_invoices_accounting_document`: un documento no puede respaldar dos facturas.
-- 3. `journal_entry.journal_no` era UNIQUE en TODA la instalación mientras `document_no` —del que
--    se deriva (`<documento>-JRN`)— es único por ENTIDAD LEGAL (`DOC-AAAA-NNNNNN` por empresa). La
--    segunda empresa que numeraba su primer documento chocaba con la primera y el alta —y el
--    reverso, que numera igual— moría con un 500. La unicidad que importa es un asiento por
--    documento (`uq_journal_entry_document`); el número se conserva y sigue indexado.
--
-- Los índices únicos se crean sólo si los datos ya los cumplen: si no, la migración AVISA y no los
-- crea, en vez de impedir que la API arranque (la serialización por bloqueo del servicio sigue
-- protegiendo). Nada se borra ni se reescribe: son hechos contables.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM atlas_accounting.accounting_document
     WHERE source_system = 'CRM' AND source_type = 'MERCHANT_INVOICE' AND status <> 'VOID'
     GROUP BY source_id HAVING count(*) > 1
  ) THEN
    RAISE WARNING 'P-06: hay facturas de comercio con más de un documento contable; no se crea uq_accounting_document_merchant_invoice_origin';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_document_merchant_invoice_origin
      ON atlas_accounting.accounting_document (source_system, source_type, source_id)
      WHERE source_system = 'CRM' AND source_type = 'MERCHANT_INVOICE' AND status <> 'VOID';
  END IF;

  IF EXISTS (
    SELECT 1 FROM atlas_sales.merchant_invoices
     WHERE accounting_document_id IS NOT NULL
     GROUP BY accounting_document_id HAVING count(*) > 1
  ) THEN
    RAISE WARNING 'P-06: hay documentos contables enlazados a más de una factura; no se crea uq_merchant_invoices_accounting_document';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_invoices_accounting_document
      ON atlas_sales.merchant_invoices (accounting_document_id)
      WHERE accounting_document_id IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM atlas_accounting.journal_entry
     GROUP BY accounting_document_id HAVING count(*) > 1
  ) THEN
    RAISE WARNING 'P-06: hay documentos con más de un asiento; se conserva la unicidad global de journal_no';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entry_document
      ON atlas_accounting.journal_entry (accounting_document_id);
    ALTER TABLE atlas_accounting.journal_entry
      DROP CONSTRAINT IF EXISTS journal_entry_journal_no_key;
    CREATE INDEX IF NOT EXISTS idx_journal_entry_journal_no
      ON atlas_accounting.journal_entry (journal_no);
  END IF;
END $$;
