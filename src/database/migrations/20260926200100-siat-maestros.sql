-- =====================================================================================
-- Facturación electrónica con el SIAT: datos fiscales en los maestros de ventas (2026-09-26)
-- =====================================================================================
-- Plan de facturación SIAT §2.2. La factura de comercio no guardaba NIT, tipo de documento,
-- correo de facturación, moneda ni emisor; el catálogo de productos facturables no sabía qué
-- producto y unidad del SIN corresponden a cada cosa que Atlas vende. Sin eso no hay XML válido.
--
-- Sólo AÑADE columnas nulas o con valor por defecto: ninguna fila existente cambia de sentido.
-- Va en `db:migrate:portal` porque necesita `billing_products`, que se crea en esa lista.
-- Idempotente.

ALTER TABLE atlas_sales.b2b_accounts
  ADD COLUMN IF NOT EXISTS tax_document_type smallint,
  ADD COLUMN IF NOT EXISTS tax_id_complement varchar(5),
  ADD COLUMN IF NOT EXISTS billing_email varchar(180);

ALTER TABLE atlas_sales.billing_products
  ADD COLUMN IF NOT EXISTS sin_product_code bigint,
  ADD COLUMN IF NOT EXISTS sin_unit_code smallint NOT NULL DEFAULT 58,
  ADD COLUMN IF NOT EXISTS sin_activity_code varchar(10);

ALTER TABLE atlas_sales.merchant_invoices
  ADD COLUMN IF NOT EXISTS currency_code char(3) NOT NULL DEFAULT 'BOB',
  ADD COLUMN IF NOT EXISTS legal_entity_id uuid;

COMMENT ON COLUMN atlas_sales.b2b_accounts.tax_document_type IS
  'codigoTipoDocumentoIdentidad del SIN del comercio (1 CI, 2 CEX, 3 PAS, 4 OD, 5 NIT).';
COMMENT ON COLUMN atlas_sales.billing_products.sin_product_code IS
  'codigoProductoSin homologado ante el SIN para este producto. Sin él la factura fiscal no se emite.';
COMMENT ON COLUMN atlas_sales.billing_products.sin_unit_code IS
  'unidadMedida del SIN; 58 = UNIDAD (SERVICIOS).';
