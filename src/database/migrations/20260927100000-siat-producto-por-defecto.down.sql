ALTER TABLE atlas_accounting.siat_issuer_profile
  DROP COLUMN IF EXISTS producto_sin_default,
  DROP COLUMN IF EXISTS unidad_medida_default;
