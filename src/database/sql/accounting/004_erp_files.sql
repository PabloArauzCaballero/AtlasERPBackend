-- ATLAS ERP - Fase 3
-- Entidad de archivos general del backend del ERP (reusable por Contabilidad, CRM y Portal).
-- Metadatos de archivos subidos a Cloudinary (signed direct upload); los bytes no pasan por el backend.
-- Ejecutar en PostgreSQL 14+. Idempotente.

CREATE SCHEMA IF NOT EXISTS atlas_accounting;
SET search_path TO atlas_accounting;

CREATE TABLE IF NOT EXISTS erp_file (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type varchar(40) NOT NULL, -- GL_ACCOUNT, BUSINESS_PARTNER, ACCOUNTING_DOCUMENT, CONTRACT, B2B_ACCOUNT, OPPORTUNITY, MERCHANT, ...
  owner_id uuid NOT NULL,
  file_name varchar(240) NOT NULL,
  mime_type varchar(120),
  byte_size bigint,
  storage_provider varchar(30) NOT NULL DEFAULT 'CLOUDINARY',
  storage_public_id varchar(300) NOT NULL,
  secure_url varchar(600) NOT NULL,
  resource_type varchar(20), -- image, raw, video
  sha256 varchar(64),
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_file_owner ON erp_file(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_erp_file_status ON erp_file(status);
