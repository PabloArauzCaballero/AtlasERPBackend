
-- ATLAS Accounting General Ledger - PostgreSQL schema
-- Objetivo: base relacional para módulo contable SAP-like liviano.
-- Ejecutar en PostgreSQL 14+.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS atlas_accounting;
SET search_path TO atlas_accounting;

-- =============================
-- 1. Organización financiera
-- =============================

CREATE TABLE legal_entity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(20) NOT NULL UNIQUE,
  legal_name varchar(200) NOT NULL,
  tax_id varchar(40),
  country_code char(2) NOT NULL DEFAULT 'BO',
  base_currency char(3) NOT NULL DEFAULT 'BOB',
  timezone varchar(50) NOT NULL DEFAULT 'America/La_Paz',
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE branch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id uuid NOT NULL REFERENCES legal_entity(id),
  code varchar(20) NOT NULL,
  name varchar(120) NOT NULL,
  city varchar(80),
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  UNIQUE (legal_entity_id, code)
);

CREATE TABLE fiscal_year (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id uuid NOT NULL REFERENCES legal_entity(id),
  year_label varchar(10) NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'OPEN',
  UNIQUE (legal_entity_id, year_label),
  CHECK (start_date < end_date)
);

CREATE TABLE accounting_period (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year_id uuid NOT NULL REFERENCES fiscal_year(id),
  period_no smallint NOT NULL CHECK (period_no BETWEEN 1 AND 13),
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_open boolean NOT NULL DEFAULT true,
  close_status varchar(20) NOT NULL DEFAULT 'OPEN',
  closed_at timestamptz,
  closed_by uuid,
  UNIQUE (fiscal_year_id, period_no),
  CHECK (start_date <= end_date)
);

CREATE TABLE ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id uuid NOT NULL REFERENCES legal_entity(id),
  code varchar(20) NOT NULL,
  name varchar(120) NOT NULL,
  accounting_basis varchar(30) NOT NULL, -- LOCAL_BO, MANAGEMENT, IFRS
  is_default boolean NOT NULL DEFAULT false,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  UNIQUE (legal_entity_id, code)
);

CREATE TABLE chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(20) NOT NULL,
  name varchar(120) NOT NULL,
  version_no integer NOT NULL DEFAULT 1,
  effective_from date NOT NULL,
  effective_to date,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  UNIQUE (code, version_no)
);

CREATE TABLE gl_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coa_id uuid NOT NULL REFERENCES chart_of_accounts(id),
  parent_account_id uuid REFERENCES gl_account(id),
  account_no varchar(20) NOT NULL,
  name varchar(160) NOT NULL,
  account_type varchar(30) NOT NULL, -- ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE, CONTRA_ASSET
  normal_balance char(1) NOT NULL CHECK (normal_balance IN ('D','C')),
  is_control_account boolean NOT NULL DEFAULT false,
  requires_cost_center boolean NOT NULL DEFAULT false,
  requires_profit_center boolean NOT NULL DEFAULT false,
  requires_partner boolean NOT NULL DEFAULT false,
  requires_tax_code boolean NOT NULL DEFAULT false,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  UNIQUE (coa_id, account_no)
);

CREATE TABLE cost_center (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id uuid NOT NULL REFERENCES legal_entity(id),
  code varchar(20) NOT NULL,
  name varchar(120) NOT NULL,
  manager_bp_id uuid,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  UNIQUE (legal_entity_id, code)
);

CREATE TABLE profit_center (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id uuid NOT NULL REFERENCES legal_entity(id),
  code varchar(20) NOT NULL,
  name varchar(120) NOT NULL,
  segment_code varchar(20),
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  UNIQUE (legal_entity_id, code)
);

-- =============================
-- 2. Business Partner y contratos
-- =============================

CREATE TABLE business_partner (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_no varchar(30) NOT NULL UNIQUE,
  partner_type varchar(20) NOT NULL, -- PERSON, COMPANY, BANK, GOVERNMENT
  legal_name varchar(200) NOT NULL,
  trade_name varchar(160),
  tax_id varchar(40),
  country_code char(2) NOT NULL DEFAULT 'BO',
  kyb_status varchar(20) NOT NULL DEFAULT 'PENDING',
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cost_center ADD CONSTRAINT fk_cost_center_manager_bp FOREIGN KEY (manager_bp_id) REFERENCES business_partner(id);

CREATE TABLE business_partner_role (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_partner_id uuid NOT NULL REFERENCES business_partner(id),
  legal_entity_id uuid REFERENCES legal_entity(id),
  role_code varchar(30) NOT NULL, -- CUSTOMER, MERCHANT, SUPPLIER, BANK, LENDER, SHAREHOLDER, INTERCOMPANY
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  UNIQUE (business_partner_id, role_code, legal_entity_id, effective_from)
);

CREATE TABLE bp_address (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_partner_id uuid NOT NULL REFERENCES business_partner(id),
  address_type varchar(20) NOT NULL DEFAULT 'FISCAL',
  country_code char(2) NOT NULL DEFAULT 'BO',
  city varchar(80),
  line1 varchar(200),
  line2 varchar(200),
  is_primary boolean NOT NULL DEFAULT false
);

CREATE TABLE bp_bank_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_partner_id uuid NOT NULL REFERENCES business_partner(id),
  bank_name varchar(120) NOT NULL,
  account_no_hash varchar(128) NOT NULL,
  currency_code char(3) NOT NULL DEFAULT 'BOB',
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  UNIQUE (business_partner_id, account_no_hash)
);

CREATE TABLE contract_header (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_no varchar(30) NOT NULL UNIQUE,
  contract_type varchar(30) NOT NULL, -- MERCHANT, CORPORATE, SUPPLIER, LOAN, INTERCOMPANY
  legal_entity_id uuid NOT NULL REFERENCES legal_entity(id),
  counterparty_bp_id uuid NOT NULL REFERENCES business_partner(id),
  start_date date NOT NULL,
  end_date date,
  currency_code char(3) NOT NULL DEFAULT 'BOB',
  status varchar(20) NOT NULL DEFAULT 'DRAFT',
  signed_doc_id uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contract_term (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contract_header(id),
  term_code varchar(40) NOT NULL,
  term_value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE'
);

-- =============================
-- 3. Impuestos y reglas
-- =============================

CREATE TABLE tax_code (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(20) NOT NULL UNIQUE,
  tax_type varchar(20) NOT NULL, -- IVA, IT, IUE, RETENTION
  rate numeric(8,4) NOT NULL DEFAULT 0,
  recoverable_percent numeric(8,4) NOT NULL DEFAULT 0,
  effective_from date NOT NULL,
  effective_to date,
  output_gl_account_id uuid REFERENCES gl_account(id),
  input_gl_account_id uuid REFERENCES gl_account(id),
  status varchar(20) NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE posting_rule_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code varchar(60) NOT NULL,
  version_no integer NOT NULL,
  trigger_type varchar(40) NOT NULL,
  rule_json jsonb NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  UNIQUE (rule_code, version_no)
);

CREATE TABLE tax_rule_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_type varchar(20) NOT NULL,
  version_no integer NOT NULL,
  rule_json jsonb NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  UNIQUE (tax_type, version_no)
);

-- =============================
-- 4. Contabilidad general
-- =============================

CREATE TABLE accounting_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id uuid NOT NULL REFERENCES legal_entity(id),
  source_system varchar(30) NOT NULL,
  source_type varchar(30) NOT NULL,
  source_id varchar(80) NOT NULL,
  document_type varchar(30) NOT NULL,
  document_no varchar(40) NOT NULL,
  document_date date NOT NULL,
  posting_date date NOT NULL,
  accounting_period_id uuid NOT NULL REFERENCES accounting_period(id),
  ledger_id uuid NOT NULL REFERENCES ledger(id),
  currency_code char(3) NOT NULL DEFAULT 'BOB',
  status varchar(20) NOT NULL DEFAULT 'DRAFT',
  approval_status varchar(20) NOT NULL DEFAULT 'NOT_REQUIRED',
  reversal_of_id uuid REFERENCES accounting_document(id),
  reversed_by_id uuid REFERENCES accounting_document(id),
  policy_snapshot_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (legal_entity_id, document_no),
  UNIQUE (source_system, source_type, source_id, ledger_id)
);

CREATE TABLE journal_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accounting_document_id uuid NOT NULL REFERENCES accounting_document(id),
  journal_no varchar(40) NOT NULL UNIQUE,
  posting_status varchar(20) NOT NULL DEFAULT 'DRAFT',
  posted_at timestamptz,
  posted_by uuid,
  hash_sha256 varchar(64),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE journal_entry_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL REFERENCES journal_entry(id),
  line_no smallint NOT NULL,
  gl_account_id uuid NOT NULL REFERENCES gl_account(id),
  debit numeric(18,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(18,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  currency_code char(3) NOT NULL DEFAULT 'BOB',
  amount_lc numeric(18,2) NOT NULL DEFAULT 0,
  partner_id uuid REFERENCES business_partner(id),
  cost_center_id uuid REFERENCES cost_center(id),
  profit_center_id uuid REFERENCES profit_center(id),
  tax_code_id uuid REFERENCES tax_code(id),
  reference_type varchar(30),
  reference_id uuid,
  description varchar(240),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (journal_entry_id, line_no),
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);

CREATE TABLE document_attachment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accounting_document_id uuid NOT NULL REFERENCES accounting_document(id),
  file_store_key varchar(240) NOT NULL,
  mime_type varchar(100),
  sha256 varchar(64) NOT NULL,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE document_audit_log (
  id bigserial PRIMARY KEY,
  accounting_document_id uuid REFERENCES accounting_document(id),
  event_type varchar(40) NOT NULL,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================
-- 5. Facturación, AR y AP
-- =============================

CREATE TABLE billing_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contract_header(id),
  fee_type varchar(30) NOT NULL, -- MDR, SAAS, SETUP, INTERCOMPANY
  calc_method varchar(20) NOT NULL, -- FIXED, PERCENTAGE, TIERED
  rate numeric(12,6),
  fixed_amount numeric(18,2),
  revenue_account_id uuid NOT NULL REFERENCES gl_account(id),
  tax_code_id uuid REFERENCES tax_code(id),
  defer_revenue boolean NOT NULL DEFAULT false,
  effective_from date NOT NULL,
  effective_to date,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE billing_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contract_header(id),
  event_type varchar(30) NOT NULL,
  event_time timestamptz NOT NULL,
  quantity numeric(18,6) NOT NULL DEFAULT 1,
  base_amount numeric(18,2) NOT NULL,
  currency_code char(3) NOT NULL DEFAULT 'BOB',
  external_ref varchar(100),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(20) NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ar_invoice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id uuid NOT NULL REFERENCES legal_entity(id),
  customer_bp_id uuid NOT NULL REFERENCES business_partner(id),
  contract_id uuid REFERENCES contract_header(id),
  invoice_no varchar(40) NOT NULL,
  invoice_date date NOT NULL,
  due_date date NOT NULL,
  currency_code char(3) NOT NULL DEFAULT 'BOB',
  net_amount numeric(18,2) NOT NULL DEFAULT 0,
  tax_amount numeric(18,2) NOT NULL DEFAULT 0,
  gross_amount numeric(18,2) NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'DRAFT',
  accounting_document_id uuid REFERENCES accounting_document(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (legal_entity_id, invoice_no)
);

CREATE TABLE ar_invoice_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ar_invoice_id uuid NOT NULL REFERENCES ar_invoice(id),
  line_no smallint NOT NULL,
  billing_event_id uuid REFERENCES billing_event(id),
  revenue_account_id uuid NOT NULL REFERENCES gl_account(id),
  tax_code_id uuid REFERENCES tax_code(id),
  description varchar(240) NOT NULL,
  qty numeric(18,6) NOT NULL DEFAULT 1,
  unit_price numeric(18,6) NOT NULL DEFAULT 0,
  line_amount numeric(18,2) NOT NULL DEFAULT 0,
  UNIQUE (ar_invoice_id, line_no)
);

CREATE TABLE electronic_tax_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ar_invoice_id uuid NOT NULL REFERENCES ar_invoice(id),
  cuf varchar(120),
  cufd varchar(120),
  siat_status varchar(30) NOT NULL DEFAULT 'PENDING',
  xml_hash varchar(64),
  graphic_representation_url varchar(240),
  contingency_flag boolean NOT NULL DEFAULT false,
  emitted_at timestamptz,
  UNIQUE (cuf)
);

CREATE TABLE receipt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id uuid NOT NULL REFERENCES legal_entity(id),
  payer_bp_id uuid NOT NULL REFERENCES business_partner(id),
  receipt_no varchar(40) NOT NULL,
  receipt_date date NOT NULL,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  currency_code char(3) NOT NULL DEFAULT 'BOB',
  bank_account_id uuid,
  status varchar(20) NOT NULL DEFAULT 'DRAFT',
  accounting_document_id uuid REFERENCES accounting_document(id),
  UNIQUE (legal_entity_id, receipt_no)
);

CREATE TABLE receipt_allocation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES receipt(id),
  ar_invoice_id uuid NOT NULL REFERENCES ar_invoice(id),
  allocated_amount numeric(18,2) NOT NULL CHECK (allocated_amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (receipt_id, ar_invoice_id)
);

CREATE TABLE ap_invoice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id uuid NOT NULL REFERENCES legal_entity(id),
  supplier_bp_id uuid NOT NULL REFERENCES business_partner(id),
  invoice_no varchar(40) NOT NULL,
  invoice_date date NOT NULL,
  due_date date NOT NULL,
  currency_code char(3) NOT NULL DEFAULT 'BOB',
  net_amount numeric(18,2) NOT NULL DEFAULT 0,
  tax_amount numeric(18,2) NOT NULL DEFAULT 0,
  gross_amount numeric(18,2) NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'DRAFT',
  accounting_document_id uuid REFERENCES accounting_document(id),
  UNIQUE (supplier_bp_id, invoice_no)
);

CREATE TABLE ap_invoice_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ap_invoice_id uuid NOT NULL REFERENCES ap_invoice(id),
  line_no smallint NOT NULL,
  expense_account_id uuid NOT NULL REFERENCES gl_account(id),
  tax_code_id uuid REFERENCES tax_code(id),
  cost_center_id uuid REFERENCES cost_center(id),
  description varchar(240) NOT NULL,
  line_amount numeric(18,2) NOT NULL DEFAULT 0,
  UNIQUE (ap_invoice_id, line_no)
);

CREATE TABLE supplier_payment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ap_invoice_id uuid NOT NULL REFERENCES ap_invoice(id),
  payment_order_id uuid,
  payment_date date NOT NULL,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  status varchar(20) NOT NULL DEFAULT 'DRAFT',
  accounting_document_id uuid REFERENCES accounting_document(id)
);

-- =============================
-- 6. Tesorería
-- =============================

CREATE TABLE bank_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id uuid NOT NULL REFERENCES legal_entity(id),
  bank_bp_id uuid REFERENCES business_partner(id),
  account_name varchar(160) NOT NULL,
  currency_code char(3) NOT NULL DEFAULT 'BOB',
  account_no_hash varchar(128) NOT NULL,
  gl_account_id uuid REFERENCES gl_account(id),
  is_house_bank boolean NOT NULL DEFAULT true,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  UNIQUE (legal_entity_id, account_no_hash)
);

ALTER TABLE receipt ADD CONSTRAINT fk_receipt_bank_account FOREIGN KEY (bank_account_id) REFERENCES bank_account(id);

CREATE TABLE bank_statement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES bank_account(id),
  statement_no varchar(60) NOT NULL,
  statement_date date NOT NULL,
  opening_balance numeric(18,2) NOT NULL DEFAULT 0,
  closing_balance numeric(18,2) NOT NULL DEFAULT 0,
  source_file_key varchar(240),
  status varchar(20) NOT NULL DEFAULT 'IMPORTED',
  UNIQUE (bank_account_id, statement_no)
);

CREATE TABLE bank_statement_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_statement_id uuid NOT NULL REFERENCES bank_statement(id),
  line_no integer NOT NULL,
  value_date date NOT NULL,
  amount numeric(18,2) NOT NULL,
  currency_code char(3) NOT NULL DEFAULT 'BOB',
  bank_ref varchar(140),
  memo varchar(240),
  match_status varchar(20) NOT NULL DEFAULT 'UNMATCHED',
  matched_ref_type varchar(30),
  matched_ref_id uuid,
  UNIQUE (bank_statement_id, line_no)
);

CREATE TABLE payment_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id uuid NOT NULL REFERENCES legal_entity(id),
  payee_bp_id uuid NOT NULL REFERENCES business_partner(id),
  bank_account_id uuid REFERENCES bank_account(id),
  payment_type varchar(30) NOT NULL,
  requested_amount numeric(18,2) NOT NULL CHECK (requested_amount > 0),
  currency_code char(3) NOT NULL DEFAULT 'BOB',
  requested_date date NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  status varchar(20) NOT NULL DEFAULT 'REQUESTED'
);

ALTER TABLE supplier_payment ADD CONSTRAINT fk_supplier_payment_order FOREIGN KEY (payment_order_id) REFERENCES payment_order(id);

-- =============================
-- 7. Deuda, activos, provisiones, patrimonio
-- =============================

CREATE TABLE loan_contract (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id uuid NOT NULL REFERENCES legal_entity(id),
  lender_bp_id uuid NOT NULL REFERENCES business_partner(id),
  loan_no varchar(40) NOT NULL UNIQUE,
  loan_type varchar(30) NOT NULL,
  principal_amount numeric(18,2) NOT NULL CHECK (principal_amount > 0),
  current_principal numeric(18,2) NOT NULL DEFAULT 0,
  currency_code char(3) NOT NULL DEFAULT 'BOB',
  interest_rate numeric(12,6),
  rate_type varchar(20) NOT NULL DEFAULT 'FIXED',
  start_date date NOT NULL,
  maturity_date date NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE loan_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_contract_id uuid NOT NULL REFERENCES loan_contract(id),
  installment_no integer NOT NULL,
  due_date date NOT NULL,
  principal_due numeric(18,2) NOT NULL DEFAULT 0,
  interest_due numeric(18,2) NOT NULL DEFAULT 0,
  fee_due numeric(18,2) NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'PENDING',
  UNIQUE (loan_contract_id, installment_no)
);

CREATE TABLE loan_accrual (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_contract_id uuid NOT NULL REFERENCES loan_contract(id),
  accrual_date date NOT NULL,
  interest_amount numeric(18,2) NOT NULL DEFAULT 0,
  journal_entry_id uuid REFERENCES journal_entry(id),
  status varchar(20) NOT NULL DEFAULT 'GENERATED',
  UNIQUE (loan_contract_id, accrual_date)
);

CREATE TABLE fixed_asset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id uuid NOT NULL REFERENCES legal_entity(id),
  asset_no varchar(40) NOT NULL UNIQUE,
  asset_class varchar(30) NOT NULL,
  description varchar(240) NOT NULL,
  acquisition_date date NOT NULL,
  placed_in_service_date date,
  cost numeric(18,2) NOT NULL CHECK (cost >= 0),
  currency_code char(3) NOT NULL DEFAULT 'BOB',
  useful_life_months integer NOT NULL CHECK (useful_life_months > 0),
  depreciation_method varchar(20) NOT NULL DEFAULT 'STRAIGHT_LINE',
  residual_value numeric(18,2) NOT NULL DEFAULT 0,
  asset_gl_account_id uuid REFERENCES gl_account(id),
  accumulated_depr_gl_account_id uuid REFERENCES gl_account(id),
  status varchar(20) NOT NULL DEFAULT 'DRAFT'
);

CREATE TABLE asset_depreciation_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixed_asset_id uuid NOT NULL REFERENCES fixed_asset(id),
  period_id uuid NOT NULL REFERENCES accounting_period(id),
  depreciation_amount numeric(18,2) NOT NULL DEFAULT 0,
  journal_entry_id uuid REFERENCES journal_entry(id),
  status varchar(20) NOT NULL DEFAULT 'GENERATED',
  UNIQUE (fixed_asset_id, period_id)
);

CREATE TABLE provision_case (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id uuid NOT NULL REFERENCES legal_entity(id),
  case_type varchar(30) NOT NULL, -- MERCHANT_COVERAGE, LEGAL, TAX, OTHER
  counterparty_bp_id uuid REFERENCES business_partner(id),
  obligating_event_date date NOT NULL,
  policy_basis varchar(30) NOT NULL, -- IAS37, IFRS9, LOCAL
  probability_bucket varchar(20) NOT NULL,
  best_estimate numeric(18,2) NOT NULL DEFAULT 0,
  currency_code char(3) NOT NULL DEFAULT 'BOB',
  status varchar(20) NOT NULL DEFAULT 'OPEN'
);

CREATE TABLE provision_movement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provision_case_id uuid NOT NULL REFERENCES provision_case(id),
  movement_date date NOT NULL,
  movement_type varchar(20) NOT NULL, -- INITIAL, INCREASE, RELEASE, UTILIZATION
  amount numeric(18,2) NOT NULL,
  journal_entry_id uuid REFERENCES journal_entry(id)
);

CREATE TABLE equity_movement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id uuid NOT NULL REFERENCES legal_entity(id),
  shareholder_bp_id uuid REFERENCES business_partner(id),
  movement_type varchar(30) NOT NULL, -- CAPITAL, CONTRIBUTION, DIVIDEND, RESERVE, RETAINED_EARNINGS
  movement_date date NOT NULL,
  amount numeric(18,2) NOT NULL,
  currency_code char(3) NOT NULL DEFAULT 'BOB',
  accounting_document_id uuid REFERENCES accounting_document(id),
  status varchar(20) NOT NULL DEFAULT 'DRAFT'
);

-- =============================
-- 8. Cierre, reporting e integración
-- =============================

CREATE TABLE close_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id uuid NOT NULL REFERENCES legal_entity(id),
  period_id uuid NOT NULL REFERENCES accounting_period(id),
  close_type varchar(20) NOT NULL, -- MONTHLY, ANNUAL
  status varchar(20) NOT NULL DEFAULT 'STARTED',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  control_report_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (legal_entity_id, period_id, close_type)
);

CREATE TABLE financial_statement_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  close_run_id uuid NOT NULL REFERENCES close_run(id),
  statement_type varchar(40) NOT NULL, -- BALANCE_SHEET, INCOME_STATEMENT, CASH_FLOW, EQUITY_CHANGES, TAX_FORM_605
  ledger_id uuid NOT NULL REFERENCES ledger(id),
  snapshot_json jsonb NOT NULL,
  hash_sha256 varchar(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (close_run_id, statement_type, ledger_id)
);

CREATE TABLE reconciliation_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id uuid NOT NULL REFERENCES legal_entity(id),
  period_id uuid REFERENCES accounting_period(id),
  reconciliation_type varchar(30) NOT NULL, -- BANK_AR, BANK_AP, AR_GL, AP_GL, ASSET_GL, PROVISION_GL, INTERCOMPANY
  status varchar(20) NOT NULL DEFAULT 'STARTED',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE reconciliation_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_run_id uuid NOT NULL REFERENCES reconciliation_run(id),
  left_ref_type varchar(30) NOT NULL,
  left_ref_id uuid NOT NULL,
  right_ref_type varchar(30),
  right_ref_id uuid,
  difference_amount numeric(18,2) NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'OPEN',
  resolution_note varchar(300)
);

CREATE TABLE intercompany_pair (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id uuid NOT NULL REFERENCES accounting_document(id),
  target_document_id uuid REFERENCES accounting_document(id),
  source_legal_entity_id uuid NOT NULL REFERENCES legal_entity(id),
  target_legal_entity_id uuid NOT NULL REFERENCES legal_entity(id),
  amount numeric(18,2) NOT NULL,
  currency_code char(3) NOT NULL DEFAULT 'BOB',
  match_status varchar(20) NOT NULL DEFAULT 'UNMATCHED'
);

CREATE TABLE budget (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id uuid NOT NULL REFERENCES legal_entity(id),
  fiscal_year_id uuid NOT NULL REFERENCES fiscal_year(id),
  version_no integer NOT NULL DEFAULT 1,
  name varchar(120) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'DRAFT',
  approved_by uuid,
  approved_at timestamptz,
  UNIQUE (legal_entity_id, fiscal_year_id, version_no)
);

CREATE TABLE budget_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES budget(id),
  gl_account_id uuid NOT NULL REFERENCES gl_account(id),
  cost_center_id uuid REFERENCES cost_center(id),
  profit_center_id uuid REFERENCES profit_center(id),
  period_no smallint NOT NULL CHECK (period_no BETWEEN 1 AND 13),
  amount numeric(18,2) NOT NULL DEFAULT 0,
  UNIQUE (budget_id, gl_account_id, cost_center_id, profit_center_id, period_no)
);

CREATE TABLE event_outbox (
  id bigserial PRIMARY KEY,
  topic varchar(120) NOT NULL,
  aggregate_type varchar(40) NOT NULL,
  aggregate_id uuid NOT NULL,
  event_key varchar(160) NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================
-- Índices recomendados
-- =============================

CREATE INDEX idx_bp_tax_id ON business_partner(tax_id);
CREATE INDEX idx_bp_role ON business_partner_role(role_code, status);
CREATE INDEX idx_contract_counterparty ON contract_header(counterparty_bp_id, status);
CREATE INDEX idx_accdoc_posting ON accounting_document(legal_entity_id, ledger_id, posting_date, status);
CREATE INDEX idx_accdoc_source ON accounting_document(source_system, source_type, source_id);
CREATE INDEX idx_jeline_gl ON journal_entry_line(gl_account_id);
CREATE INDEX idx_jeline_partner ON journal_entry_line(partner_id);
CREATE INDEX idx_jeline_ref ON journal_entry_line(reference_type, reference_id);
CREATE INDEX idx_bevent_contract_time ON billing_event(contract_id, event_time, status);
CREATE INDEX idx_arinv_customer_due ON ar_invoice(customer_bp_id, due_date, status);
CREATE INDEX idx_apinv_supplier_due ON ap_invoice(supplier_bp_id, due_date, status);
CREATE INDEX idx_receipt_payer_date ON receipt(payer_bp_id, receipt_date);
CREATE INDEX idx_bank_stmt_date ON bank_statement(bank_account_id, statement_date);
CREATE INDEX idx_bank_stmt_line_match ON bank_statement_line(match_status, value_date);
CREATE INDEX idx_payment_order_status ON payment_order(status, requested_date);
CREATE INDEX idx_loan_maturity ON loan_contract(legal_entity_id, maturity_date, status);
CREATE INDEX idx_loan_sched_due ON loan_schedule(due_date, status);
CREATE INDEX idx_asset_status ON fixed_asset(legal_entity_id, asset_class, status);
CREATE INDEX idx_provision_type_status ON provision_case(legal_entity_id, case_type, status);
CREATE INDEX idx_close_status ON close_run(legal_entity_id, status);
CREATE INDEX idx_event_outbox_pending ON event_outbox(topic, created_at) WHERE published_at IS NULL;
CREATE INDEX gin_contract_term_json ON contract_term USING gin(term_value_json);
CREATE INDEX gin_posting_rule_json ON posting_rule_version USING gin(rule_json);
CREATE INDEX gin_event_payload ON event_outbox USING gin(payload);
