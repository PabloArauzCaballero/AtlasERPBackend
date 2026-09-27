-- =====================================================================================
-- Facturación SIAT: producto del SIN por defecto del emisor (2026-09-27)
-- =====================================================================================
-- La factura AR (contabilidad) no tiene catálogo de productos: es un servicio con descripción libre.
-- Para emitir su documento fiscal hace falta un `codigoProductoSin` homologado y una unidad; se
-- declaran UNA vez en el emisor y valen para todas sus facturas AR. Sólo añade columnas nulas o con
-- valor por defecto. Idempotente.

ALTER TABLE atlas_accounting.siat_issuer_profile
  ADD COLUMN IF NOT EXISTS producto_sin_default bigint,
  ADD COLUMN IF NOT EXISTS unidad_medida_default smallint NOT NULL DEFAULT 58;

COMMENT ON COLUMN atlas_accounting.siat_issuer_profile.producto_sin_default IS
  'codigoProductoSin homologado con que se emiten las facturas AR de este emisor (no tienen catálogo propio).';
