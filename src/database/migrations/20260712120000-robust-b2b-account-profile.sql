-- Perfil comercial robusto y taxonomía N:N para cuentas B2B.
ALTER TABLE atlas_sales.b2b_accounts
  ADD COLUMN IF NOT EXISTS category varchar(120),
  ADD COLUMN IF NOT EXISTS business_line varchar(160),
  ADD COLUMN IF NOT EXISTS business_description text,
  ADD COLUMN IF NOT EXISTS website_url varchar(500),
  ADD COLUMN IF NOT EXISTS country_code varchar(2) NOT NULL DEFAULT 'BO',
  ADD COLUMN IF NOT EXISTS city varchar(120),
  ADD COLUMN IF NOT EXISTS address varchar(500),
  ADD COLUMN IF NOT EXISTS employee_count integer,
  ADD COLUMN IF NOT EXISTS founded_year integer,
  ADD COLUMN IF NOT EXISTS annual_revenue numeric(18,2);

UPDATE atlas_sales.b2b_accounts
SET category = COALESCE(category, industry, 'SIN_CLASIFICAR'),
    business_line = COALESCE(business_line, industry, 'SIN_CLASIFICAR');

ALTER TABLE atlas_sales.b2b_accounts
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN business_line SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE atlas_sales.b2b_accounts ADD CONSTRAINT ck_b2b_accounts_employee_count CHECK (employee_count IS NULL OR employee_count >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE atlas_sales.b2b_accounts ADD CONSTRAINT ck_b2b_accounts_founded_year CHECK (founded_year IS NULL OR founded_year BETWEEN 1800 AND 2200);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE atlas_sales.b2b_accounts ADD CONSTRAINT ck_b2b_accounts_annual_revenue CHECK (annual_revenue IS NULL OR annual_revenue >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS atlas_sales.account_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(80) NOT NULL,
  description varchar(200),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_account_tags_name_ci ON atlas_sales.account_tags(lower(name));

CREATE TABLE IF NOT EXISTS atlas_sales.b2b_account_tags (
  account_id uuid NOT NULL REFERENCES atlas_sales.b2b_accounts(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES atlas_sales.account_tags(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_b2b_accounts_classification ON atlas_sales.b2b_accounts(category, business_line);
CREATE INDEX IF NOT EXISTS idx_b2b_account_tags_tag ON atlas_sales.b2b_account_tags(tag_id, account_id);
