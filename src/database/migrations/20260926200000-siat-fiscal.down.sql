-- Retira el núcleo fiscal SIAT. Los documentos fiscales ya emitidos NO se borran: sólo se quitan
-- las columnas nuevas; el índice 1:1 con la factura AR vuelve si los datos lo permiten.
ALTER TABLE atlas_accounting.business_partner
  DROP COLUMN IF EXISTS tax_document_type,
  DROP COLUMN IF EXISTS tax_id_complement,
  DROP COLUMN IF EXISTS billing_email;

DROP INDEX IF EXISTS atlas_accounting.ix_einvoice_processor;
DROP INDEX IF EXISTS atlas_accounting.uq_einvoice_live_source;
ALTER TABLE atlas_accounting.electronic_tax_document
  DROP CONSTRAINT IF EXISTS chk_einvoice_source_type,
  DROP CONSTRAINT IF EXISTS chk_einvoice_siat_status;

ALTER TABLE atlas_accounting.electronic_tax_document
  DROP COLUMN IF EXISTS source_type,
  DROP COLUMN IF EXISTS source_id,
  DROP COLUMN IF EXISTS superseded_by_id,
  DROP COLUMN IF EXISTS issuer_profile_id,
  DROP COLUMN IF EXISTS numero_factura,
  DROP COLUMN IF EXISTS cuis,
  DROP COLUMN IF EXISTS cufd_id,
  DROP COLUMN IF EXISTS codigo_documento_sector,
  DROP COLUMN IF EXISTS tipo_factura_documento,
  DROP COLUMN IF EXISTS codigo_emision,
  DROP COLUMN IF EXISTS codigo_modalidad,
  DROP COLUMN IF EXISTS codigo_excepcion,
  DROP COLUMN IF EXISTS fecha_emision,
  DROP COLUMN IF EXISTS codigo_recepcion,
  DROP COLUMN IF EXISTS codigo_estado_sin,
  DROP COLUMN IF EXISTS mensajes,
  DROP COLUMN IF EXISTS xml_gzip,
  DROP COLUMN IF EXISTS xml_sha256,
  DROP COLUMN IF EXISTS receptor_snapshot,
  DROP COLUMN IF EXISTS monto_total,
  DROP COLUMN IF EXISTS attempt_count,
  DROP COLUMN IF EXISTS last_error,
  DROP COLUMN IF EXISTS next_attempt_at,
  DROP COLUMN IF EXISTS sent_at,
  DROP COLUMN IF EXISTS event_id,
  DROP COLUMN IF EXISTS package_id,
  DROP COLUMN IF EXISTS annulment_motivo,
  DROP COLUMN IF EXISTS annulled_at,
  DROP COLUMN IF EXISTS created_at,
  DROP COLUMN IF EXISTS updated_at;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT ar_invoice_id FROM atlas_accounting.electronic_tax_document
     WHERE ar_invoice_id IS NOT NULL GROUP BY ar_invoice_id HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_einvoice_ar_invoice
      ON atlas_accounting.electronic_tax_document (ar_invoice_id);
  ELSE
    RAISE WARNING 'SIAT down: hay facturas AR con más de un documento fiscal; uq_einvoice_ar_invoice no se recrea.';
  END IF;
END $$;

DROP TABLE IF EXISTS atlas_accounting.siat_transaction_log;
DROP TABLE IF EXISTS atlas_accounting.siat_catalog_sync_run;
DROP TABLE IF EXISTS atlas_accounting.siat_catalog_item;
DROP TABLE IF EXISTS atlas_accounting.siat_package;
DROP TABLE IF EXISTS atlas_accounting.siat_significant_event;
DROP TABLE IF EXISTS atlas_accounting.siat_number_series;
DROP TABLE IF EXISTS atlas_accounting.siat_cufd;
DROP TABLE IF EXISTS atlas_accounting.siat_cuis;
DROP TABLE IF EXISTS atlas_accounting.siat_issuer_profile;
