-- =====================================================================================
-- Cada requisito del checklist de onboarding puede llevar su ARCHIVO.
-- =====================================================================================
-- La pantalla prometía «requisitos legales» (NIT vigente, matrícula, poder) y sólo guardaba un
-- estado: el requisito se marcaba COMPLETED con un desplegable y ningún documento respaldaba la
-- activación del comercio. El archivo vive en el almacén de evidencia de Atlas (MinIO, por permiso
-- firmado emitido por AtlasBackend bajo `<tenant>/erp-onboarding_case-<caso>/`); aquí queda su
-- referencia, su hash y cuándo se subió, que es lo que permite demostrar después con qué documento
-- se habilitó un comercio.

ALTER TABLE atlas_sales.onboarding_checklist_items
  ADD COLUMN IF NOT EXISTS evidence_storage_key varchar(500),
  ADD COLUMN IF NOT EXISTS evidence_content_type varchar(120),
  ADD COLUMN IF NOT EXISTS evidence_sha256 char(64),
  ADD COLUMN IF NOT EXISTS evidence_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS evidence_uploaded_at timestamptz;

COMMENT ON COLUMN atlas_sales.onboarding_checklist_items.evidence_storage_key IS
  'Clave del objeto en el almacén de evidencia de Atlas. Nulo si el requisito no lleva archivo.';
COMMENT ON COLUMN atlas_sales.onboarding_checklist_items.evidence_sha256 IS
  'SHA-256 del archivo verificado por AtlasBackend al registrarlo.';
