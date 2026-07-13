-- ATLAS - Puente facturación merchant (CRM) → contabilidad
-- Unifica la cuenta B2B con un business partner facturable y registra el documento
-- contable generado al postear una factura merchant al mayor. Idempotente.

ALTER TABLE atlas_sales.b2b_accounts
  ADD COLUMN IF NOT EXISTS business_partner_id uuid;

ALTER TABLE atlas_sales.merchant_invoices
  ADD COLUMN IF NOT EXISTS accounting_document_id uuid;

CREATE INDEX IF NOT EXISTS idx_b2b_accounts_business_partner
  ON atlas_sales.b2b_accounts(business_partner_id);
