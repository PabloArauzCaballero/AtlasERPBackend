DROP INDEX IF EXISTS atlas_sales.idx_merchant_invoice_lines_product;
DROP INDEX IF EXISTS atlas_sales.idx_merchant_receivables_product;

ALTER TABLE atlas_sales.merchant_invoice_lines DROP COLUMN IF EXISTS product_id;
ALTER TABLE atlas_sales.merchant_receivables DROP COLUMN IF EXISTS product_id;

DROP TABLE IF EXISTS atlas_sales.billing_products;
