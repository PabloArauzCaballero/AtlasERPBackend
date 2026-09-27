ALTER TABLE atlas_sales.merchant_invoices
  DROP COLUMN IF EXISTS currency_code,
  DROP COLUMN IF EXISTS legal_entity_id;
ALTER TABLE atlas_sales.billing_products
  DROP COLUMN IF EXISTS sin_product_code,
  DROP COLUMN IF EXISTS sin_unit_code,
  DROP COLUMN IF EXISTS sin_activity_code;
ALTER TABLE atlas_sales.b2b_accounts
  DROP COLUMN IF EXISTS tax_document_type,
  DROP COLUMN IF EXISTS tax_id_complement,
  DROP COLUMN IF EXISTS billing_email;
