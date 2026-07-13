-- ATLAS Accounting - Fase 3
-- Cuentas contables por defecto de cada business partner (CxC, anticipos, recargos, retenciones...).
-- Se auto-provisionan "slots" al crear el partner; finanzas asigna luego la cuenta GL real.
-- Ejecutar en PostgreSQL 14+. Idempotente.

CREATE SCHEMA IF NOT EXISTS atlas_accounting;
SET search_path TO atlas_accounting;

CREATE TABLE IF NOT EXISTS business_partner_default_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_partner_id uuid NOT NULL REFERENCES business_partner(id) ON DELETE CASCADE,
  account_purpose varchar(40) NOT NULL, -- AR_CONTROL, AP_CONTROL, CUSTOMER_ADVANCES, SUPPLIER_ADVANCES, SURCHARGES, DISCOUNTS, WITHHOLDINGS
  gl_account_id uuid REFERENCES gl_account(id),
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_partner_id, account_purpose)
);

CREATE INDEX IF NOT EXISTS idx_bp_default_account_partner ON business_partner_default_account(business_partner_id);
CREATE INDEX IF NOT EXISTS idx_bp_default_account_gl ON business_partner_default_account(gl_account_id);
