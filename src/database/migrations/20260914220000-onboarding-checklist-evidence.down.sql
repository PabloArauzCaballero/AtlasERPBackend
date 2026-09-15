ALTER TABLE atlas_sales.onboarding_checklist_items
  DROP COLUMN IF EXISTS evidence_storage_key,
  DROP COLUMN IF EXISTS evidence_content_type,
  DROP COLUMN IF EXISTS evidence_sha256,
  DROP COLUMN IF EXISTS evidence_size_bytes,
  DROP COLUMN IF EXISTS evidence_uploaded_at;
