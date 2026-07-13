-- ATLAS CRM/Ventas B2B — Modelo relacional sugerido PostgreSQL
-- Nota: Este DDL es una base de diseño. Ajustar nombres de schemas, tipos y enums según estándares del backend.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS atlas_sales;

-- =============================
-- ENUMS
-- =============================
DO $$ BEGIN
  CREATE TYPE atlas_sales.account_type AS ENUM ('MERCHANT','PARTNER','DISTRIBUTOR','FINANCIAL_ALLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE atlas_sales.account_status AS ENUM ('LEAD','QUALIFIED','CUSTOMER','SUSPENDED','TERMINATED','DISQUALIFIED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE atlas_sales.opportunity_stage AS ENUM ('DISCOVERY','QUALIFICATION','PROPOSAL','NEGOTIATION','CONTRACTING','CLOSED_WON','CLOSED_LOST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE atlas_sales.opportunity_type AS ENUM ('NEW_MERCHANT','RENEWAL','UPSELL','CROSS_SELL','REACTIVATION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE atlas_sales.contract_status AS ENUM ('DRAFT','PENDING_SIGNATURE','ACTIVE','EXPIRED','TERMINATED','SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE atlas_sales.term_type AS ENUM ('MDR','SUBSCRIPTION','SETUP_FEE','SERVICE_FEE','PENALTY','MINIMUM_MONTHLY_FEE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE atlas_sales.billing_timing AS ENUM ('PER_TRANSACTION','MONTHLY','ONE_TIME','ON_DEMAND');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE atlas_sales.invoice_status AS ENUM ('DRAFT','ISSUED','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE atlas_sales.receivable_status AS ENUM ('PENDING','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED','DISPUTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE atlas_sales.payable_status AS ENUM ('SCHEDULED','DUE','PAID','CANCELLED','DISPUTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE atlas_sales.recovery_status AS ENUM ('OPEN','IN_COLLECTION','PARTIALLY_RECOVERED','RECOVERED','WRITTEN_OFF');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================
-- USUARIOS Y TERRITORIOS
-- =============================
CREATE TABLE IF NOT EXISTS atlas_sales.internal_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name varchar(180) NOT NULL,
  email varchar(180) NOT NULL UNIQUE,
  role_code varchar(80) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atlas_sales.territories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  city varchar(120),
  region varchar(120),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================
-- CUENTAS B2B Y CONTACTOS
-- =============================
CREATE TABLE IF NOT EXISTS atlas_sales.b2b_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name varchar(220) NOT NULL,
  trade_name varchar(220) NOT NULL,
  tax_id varchar(60),
  account_type atlas_sales.account_type NOT NULL DEFAULT 'MERCHANT',
  industry varchar(120),
  lifecycle_status atlas_sales.account_status NOT NULL DEFAULT 'LEAD',
  owner_user_id uuid REFERENCES atlas_sales.internal_users(id),
  territory_id uuid REFERENCES atlas_sales.territories(id),
  risk_tier varchar(30),
  expected_monthly_volume numeric(18,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_b2b_accounts_tax_id UNIQUE (tax_id)
);

CREATE TABLE IF NOT EXISTS atlas_sales.b2b_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES atlas_sales.b2b_accounts(id),
  full_name varchar(180) NOT NULL,
  role_title varchar(120),
  email varchar(180),
  phone varchar(60),
  decision_role varchar(60),
  is_primary boolean NOT NULL DEFAULT false,
  status varchar(30) NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================
-- PIPELINE COMERCIAL
-- =============================
CREATE TABLE IF NOT EXISTS atlas_sales.sales_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES atlas_sales.b2b_accounts(id),
  owner_user_id uuid NOT NULL REFERENCES atlas_sales.internal_users(id),
  name varchar(220) NOT NULL,
  opportunity_type atlas_sales.opportunity_type NOT NULL,
  stage atlas_sales.opportunity_stage NOT NULL DEFAULT 'DISCOVERY',
  expected_monthly_volume numeric(18,2),
  expected_mdr_rate numeric(9,6),
  expected_monthly_revenue numeric(18,2),
  probability numeric(5,2) DEFAULT 0,
  expected_close_date date,
  loss_reason varchar(220),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atlas_sales.commercial_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES atlas_sales.b2b_accounts(id),
  opportunity_id uuid REFERENCES atlas_sales.sales_opportunities(id),
  owner_user_id uuid NOT NULL REFERENCES atlas_sales.internal_users(id),
  activity_type varchar(50) NOT NULL,
  subject varchar(220) NOT NULL,
  description text,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atlas_sales.commercial_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES atlas_sales.sales_opportunities(id),
  account_id uuid NOT NULL REFERENCES atlas_sales.b2b_accounts(id),
  proposal_number varchar(80) NOT NULL UNIQUE,
  status varchar(40) NOT NULL DEFAULT 'DRAFT',
  valid_until date,
  total_estimated_monthly_revenue numeric(18,2),
  created_by_user_id uuid NOT NULL REFERENCES atlas_sales.internal_users(id),
  sent_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atlas_sales.proposal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES atlas_sales.commercial_proposals(id),
  term_type atlas_sales.term_type NOT NULL,
  description varchar(240) NOT NULL,
  rate_percent numeric(9,6),
  fixed_amount numeric(18,2),
  currency char(3) NOT NULL DEFAULT 'BOB',
  billing_timing atlas_sales.billing_timing NOT NULL,
  minimum_monthly_amount numeric(18,2),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atlas_sales.approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid REFERENCES atlas_sales.commercial_proposals(id),
  contract_version_id uuid,
  requested_by_user_id uuid NOT NULL REFERENCES atlas_sales.internal_users(id),
  approval_type varchar(80) NOT NULL,
  reason text NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'PENDING',
  approved_by_user_id uuid REFERENCES atlas_sales.internal_users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================
-- CONTRATOS Y PRICING
-- =============================
CREATE TABLE IF NOT EXISTS atlas_sales.b2b_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES atlas_sales.b2b_accounts(id),
  opportunity_id uuid REFERENCES atlas_sales.sales_opportunities(id),
  contract_number varchar(80) NOT NULL UNIQUE,
  status atlas_sales.contract_status NOT NULL DEFAULT 'DRAFT',
  start_date date,
  end_date date,
  billing_cycle varchar(40) NOT NULL DEFAULT 'MONTHLY',
  settlement_policy varchar(80) NOT NULL DEFAULT 'PER_CONTRACT',
  signed_at timestamptz,
  terminated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atlas_sales.contract_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES atlas_sales.b2b_contracts(id),
  version_number integer NOT NULL,
  valid_from date NOT NULL,
  valid_to date,
  status varchar(40) NOT NULL DEFAULT 'DRAFT',
  document_url text,
  approved_by_user_id uuid REFERENCES atlas_sales.internal_users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_contract_version UNIQUE (contract_id, version_number),
  CONSTRAINT ck_contract_version_dates CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

-- FK approval_requests.contract_version_id can be added after contract_versions exists if needed.
-- ALTER TABLE atlas_sales.approval_requests ADD CONSTRAINT fk_approval_contract_version
-- FOREIGN KEY (contract_version_id) REFERENCES atlas_sales.contract_versions(id);

CREATE TABLE IF NOT EXISTS atlas_sales.commercial_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version_id uuid NOT NULL REFERENCES atlas_sales.contract_versions(id),
  term_type atlas_sales.term_type NOT NULL,
  description varchar(240),
  rate_percent numeric(9,6),
  fixed_amount numeric(18,2),
  currency char(3) NOT NULL DEFAULT 'BOB',
  billing_timing atlas_sales.billing_timing NOT NULL,
  min_amount numeric(18,2),
  max_amount numeric(18,2),
  applies_from date,
  applies_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_commercial_term_value CHECK (rate_percent IS NOT NULL OR fixed_amount IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS atlas_sales.mdr_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version_id uuid NOT NULL REFERENCES atlas_sales.contract_versions(id),
  product_category varchar(120),
  branch_id uuid,
  risk_segment varchar(60),
  rate_percent numeric(9,6) NOT NULL,
  min_fee_amount numeric(18,2),
  max_fee_amount numeric(18,2),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================
-- ONBOARDING Y SUCURSALES
-- =============================
CREATE TABLE IF NOT EXISTS atlas_sales.merchant_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES atlas_sales.b2b_accounts(id),
  name varchar(180) NOT NULL,
  city varchar(120) NOT NULL,
  address text,
  status varchar(40) NOT NULL DEFAULT 'DRAFT',
  can_originate_bnpl boolean NOT NULL DEFAULT false,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- FK mdr_rules.branch_id can be added if mdr_rules is created after merchant_branches in your migration order.
-- ALTER TABLE atlas_sales.mdr_rules ADD CONSTRAINT fk_mdr_rule_branch
-- FOREIGN KEY (branch_id) REFERENCES atlas_sales.merchant_branches(id);

CREATE TABLE IF NOT EXISTS atlas_sales.merchant_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES atlas_sales.b2b_accounts(id),
  branch_id uuid REFERENCES atlas_sales.merchant_branches(id),
  email varchar(180) NOT NULL,
  full_name varchar(180) NOT NULL,
  role_code varchar(80) NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'INVITED',
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_merchant_user_email_per_account UNIQUE (account_id, email)
);

CREATE TABLE IF NOT EXISTS atlas_sales.merchant_onboarding_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES atlas_sales.b2b_accounts(id),
  owner_user_id uuid NOT NULL REFERENCES atlas_sales.internal_users(id),
  status varchar(40) NOT NULL DEFAULT 'OPEN',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS atlas_sales.onboarding_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_case_id uuid NOT NULL REFERENCES atlas_sales.merchant_onboarding_cases(id),
  item_type varchar(80) NOT NULL,
  description varchar(240) NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'PENDING',
  completed_by_user_id uuid REFERENCES atlas_sales.internal_users(id),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================
-- CORE BNPL LINK SIMPLIFICADO
-- =============================
CREATE TABLE IF NOT EXISTS atlas_sales.consumers_ref (
  id uuid PRIMARY KEY,
  external_ref varchar(120),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atlas_sales.bnpl_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_account_id uuid NOT NULL REFERENCES atlas_sales.b2b_accounts(id),
  branch_id uuid REFERENCES atlas_sales.merchant_branches(id),
  consumer_id uuid NOT NULL REFERENCES atlas_sales.consumers_ref(id),
  contract_version_id uuid NOT NULL REFERENCES atlas_sales.contract_versions(id),
  purchase_amount numeric(18,2) NOT NULL,
  down_payment_amount numeric(18,2) NOT NULL,
  financed_amount numeric(18,2) NOT NULL,
  risk_tier_at_origination varchar(60),
  cohort_id varchar(80),
  status varchar(40) NOT NULL DEFAULT 'PENDING',
  purchase_date timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_purchase_amounts CHECK (purchase_amount >= 0 AND down_payment_amount >= 0 AND financed_amount >= 0)
);

CREATE TABLE IF NOT EXISTS atlas_sales.bnpl_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES atlas_sales.bnpl_purchases(id),
  installment_number integer NOT NULL,
  due_date date NOT NULL,
  amount numeric(18,2) NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'SCHEDULED',
  paid_to_merchant_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_installment_per_purchase UNIQUE (purchase_id, installment_number)
);

CREATE TABLE IF NOT EXISTS atlas_sales.consumer_payments_to_merchant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES atlas_sales.bnpl_purchases(id),
  installment_id uuid REFERENCES atlas_sales.bnpl_installments(id),
  amount numeric(18,2) NOT NULL,
  paid_at timestamptz NOT NULL,
  evidence_ref text,
  status varchar(40) NOT NULL DEFAULT 'REPORTED',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================
-- FACTURACION Y CXC B2B
-- =============================
CREATE TABLE IF NOT EXISTS atlas_sales.merchant_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES atlas_sales.b2b_accounts(id),
  contract_id uuid REFERENCES atlas_sales.b2b_contracts(id),
  invoice_number varchar(80) NOT NULL UNIQUE,
  invoice_date date NOT NULL,
  due_date date NOT NULL,
  subtotal_amount numeric(18,2) NOT NULL DEFAULT 0,
  tax_amount numeric(18,2) NOT NULL DEFAULT 0,
  total_amount numeric(18,2) NOT NULL DEFAULT 0,
  status atlas_sales.invoice_status NOT NULL DEFAULT 'DRAFT',
  external_tax_ref varchar(180),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atlas_sales.merchant_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES atlas_sales.merchant_invoices(id),
  source_type varchar(80) NOT NULL,
  source_id uuid,
  description varchar(260) NOT NULL,
  quantity numeric(18,4) NOT NULL DEFAULT 1,
  unit_amount numeric(18,2) NOT NULL,
  tax_amount numeric(18,2) NOT NULL DEFAULT 0,
  total_amount numeric(18,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atlas_sales.merchant_receivables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES atlas_sales.b2b_accounts(id),
  invoice_id uuid REFERENCES atlas_sales.merchant_invoices(id),
  source_type varchar(80) NOT NULL, -- MDR, SUBSCRIPTION, SETUP_FEE, PENALTY, SERVICE_FEE
  source_id uuid,
  amount_original numeric(18,2) NOT NULL,
  amount_open numeric(18,2) NOT NULL,
  currency char(3) NOT NULL DEFAULT 'BOB',
  issued_at timestamptz NOT NULL DEFAULT now(),
  due_date date NOT NULL,
  status atlas_sales.receivable_status NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_merchant_receivable_amounts CHECK (amount_original >= 0 AND amount_open >= 0 AND amount_open <= amount_original)
);

CREATE TABLE IF NOT EXISTS atlas_sales.merchant_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES atlas_sales.b2b_accounts(id),
  amount numeric(18,2) NOT NULL,
  currency char(3) NOT NULL DEFAULT 'BOB',
  paid_at timestamptz NOT NULL,
  payment_method varchar(80),
  external_ref varchar(180),
  status varchar(40) NOT NULL DEFAULT 'CONFIRMED',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atlas_sales.merchant_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES atlas_sales.merchant_payments(id),
  receivable_id uuid NOT NULL REFERENCES atlas_sales.merchant_receivables(id),
  amount_applied numeric(18,2) NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_payment_allocation_amount CHECK (amount_applied > 0)
);

CREATE TABLE IF NOT EXISTS atlas_sales.merchant_credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES atlas_sales.b2b_accounts(id),
  invoice_id uuid REFERENCES atlas_sales.merchant_invoices(id),
  credit_note_number varchar(80) NOT NULL UNIQUE,
  reason varchar(240) NOT NULL,
  amount numeric(18,2) NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'ISSUED',
  approved_by_user_id uuid REFERENCES atlas_sales.internal_users(id),
  issued_at timestamptz NOT NULL DEFAULT now()
);

-- =============================
-- CXP ATLAS -> COMERCIO Y RECUPERACION CONSUMIDOR
-- =============================
CREATE TABLE IF NOT EXISTS atlas_sales.merchant_payables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES atlas_sales.b2b_accounts(id),
  purchase_id uuid NOT NULL REFERENCES atlas_sales.bnpl_purchases(id),
  installment_id uuid NOT NULL REFERENCES atlas_sales.bnpl_installments(id),
  reason varchar(80) NOT NULL DEFAULT 'CUSTOMER_INSTALLMENT_DEFAULT_COVERAGE',
  amount numeric(18,2) NOT NULL,
  scheduled_payment_date date NOT NULL,
  paid_at timestamptz,
  status atlas_sales.payable_status NOT NULL DEFAULT 'SCHEDULED',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_payable_per_installment UNIQUE (installment_id)
);

CREATE TABLE IF NOT EXISTS atlas_sales.consumer_recovery_receivables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id uuid NOT NULL REFERENCES atlas_sales.consumers_ref(id),
  purchase_id uuid NOT NULL REFERENCES atlas_sales.bnpl_purchases(id),
  installment_id uuid NOT NULL REFERENCES atlas_sales.bnpl_installments(id),
  merchant_payable_id uuid NOT NULL UNIQUE REFERENCES atlas_sales.merchant_payables(id),
  amount_covered_by_atlas numeric(18,2) NOT NULL,
  amount_recovered numeric(18,2) NOT NULL DEFAULT 0,
  coverage_paid_at timestamptz,
  recovery_status atlas_sales.recovery_status NOT NULL DEFAULT 'OPEN',
  days_past_due integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_recovery_amounts CHECK (amount_covered_by_atlas >= 0 AND amount_recovered >= 0 AND amount_recovered <= amount_covered_by_atlas)
);

-- =============================
-- CONCILIACION Y AUDITORIA
-- =============================
CREATE TABLE IF NOT EXISTS atlas_sales.reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'RUNNING',
  started_by_user_id uuid REFERENCES atlas_sales.internal_users(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT ck_reconciliation_period CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS atlas_sales.reconciliation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES atlas_sales.reconciliation_runs(id),
  item_type varchar(80) NOT NULL,
  severity varchar(40) NOT NULL DEFAULT 'MEDIUM',
  account_id uuid REFERENCES atlas_sales.b2b_accounts(id),
  source_ref varchar(180),
  description text NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'OPEN',
  resolved_by_user_id uuid REFERENCES atlas_sales.internal_users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atlas_sales.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_name varchar(120) NOT NULL,
  entity_id uuid NOT NULL,
  action varchar(80) NOT NULL,
  changed_by_user_id uuid REFERENCES atlas_sales.internal_users(id),
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================
-- INDICES
-- =============================
CREATE INDEX IF NOT EXISTS idx_b2b_accounts_status ON atlas_sales.b2b_accounts(lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_b2b_accounts_owner ON atlas_sales.b2b_accounts(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_pipeline ON atlas_sales.sales_opportunities(stage, expected_close_date);
CREATE INDEX IF NOT EXISTS idx_contracts_account_status ON atlas_sales.b2b_contracts(account_id, status);
CREATE INDEX IF NOT EXISTS idx_contract_versions_validity ON atlas_sales.contract_versions(contract_id, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_purchases_merchant_date ON atlas_sales.bnpl_purchases(merchant_account_id, purchase_date);
CREATE INDEX IF NOT EXISTS idx_installments_due_status ON atlas_sales.bnpl_installments(due_date, status);
CREATE INDEX IF NOT EXISTS idx_invoices_account_status ON atlas_sales.merchant_invoices(account_id, status, invoice_date);
CREATE INDEX IF NOT EXISTS idx_receivables_account_due ON atlas_sales.merchant_receivables(account_id, due_date, status);
CREATE INDEX IF NOT EXISTS idx_payables_account_due ON atlas_sales.merchant_payables(account_id, scheduled_payment_date, status);
CREATE INDEX IF NOT EXISTS idx_recovery_consumer_status ON atlas_sales.consumer_recovery_receivables(consumer_id, recovery_status);

-- =============================
-- HARDENING DE INTEGRIDAD / IDEMPOTENCIA OPERATIVA
-- =============================
-- Un solo contacto principal por cuenta. Evita estados ambiguos en comunicación comercial.
CREATE UNIQUE INDEX IF NOT EXISTS uq_b2b_primary_contact_per_account
  ON atlas_sales.b2b_contacts(account_id)
  WHERE is_primary = true;

-- Evita usuarios comercio duplicados dentro de la misma cuenta, incluso con diferencias de mayúsculas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_users_account_email_ci
  ON atlas_sales.merchant_users(account_id, lower(email));

-- Evita re-facturar o recrear varias CxC para el mismo origen operativo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_receivable_source
  ON atlas_sales.merchant_receivables(source_type, source_id)
  WHERE source_id IS NOT NULL;

-- Facilita idempotencia de pagos cuando el integrador envía una referencia externa estable.
CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_payment_account_external_ref
  ON atlas_sales.merchant_payments(account_id, external_ref)
  WHERE external_ref IS NOT NULL;

-- Evita duplicar la misma diferencia dentro de una corrida de conciliación.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reconciliation_item_run_type_source
  ON atlas_sales.reconciliation_items(run_id, item_type, source_ref)
  WHERE source_ref IS NOT NULL;
