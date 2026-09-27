-- =====================================================================================
-- Facturación SIAT: entrega de la factura al comprador por correo (D-8) — 2026-09-27
-- =====================================================================================
-- El SIN obliga a entregar al comprador la representación gráfica Y el XML de su factura, y a
-- avisarle cuando se anula. Cola propia (la de correos de publicidad exige una campaña): una fila
-- por documento y tipo —la unicidad es la idempotencia—, reclamada con CAS y con reintentos.
-- Sólo AÑADE una tabla. Idempotente.

CREATE TABLE IF NOT EXISTS atlas_accounting.siat_email_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES atlas_accounting.electronic_tax_document(id),
  kind varchar(20) NOT NULL,
  recipient varchar(180) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'PENDING',
  attempt_count integer NOT NULL DEFAULT 0,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  provider_message_id varchar(200),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_siat_email_delivery_document_kind UNIQUE (document_id, kind),
  CONSTRAINT ck_siat_email_delivery_kind CHECK (kind IN ('EMISION', 'ANULACION')),
  CONSTRAINT ck_siat_email_delivery_status CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED'))
);
CREATE INDEX IF NOT EXISTS ix_siat_email_delivery_due
  ON atlas_accounting.siat_email_delivery (status, scheduled_at)
  WHERE status IN ('PENDING', 'PROCESSING');

COMMENT ON TABLE atlas_accounting.siat_email_delivery IS
  'Correos al comprador de cada documento fiscal (factura emitida, anulación). Una fila por documento y tipo.';
