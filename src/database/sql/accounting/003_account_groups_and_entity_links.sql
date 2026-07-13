-- ATLAS Accounting - Fase 3
-- Grupos de cuenta (árbol de reporte) + vínculos multientidad para cuentas y asientos.
-- Ejecutar en PostgreSQL 14+. Idempotente (IF NOT EXISTS / DROP-safe).

CREATE SCHEMA IF NOT EXISTS atlas_accounting;
SET search_path TO atlas_accounting;

-- ==================================================
-- 1. Grupo de cuenta (taxonomía de reporte / árbol)
--    Ej.: Balance General > Activo > Activo Corriente > (subgrupo)
--    Es independiente de parent_account_id (jerarquía cuenta-a-cuenta):
--    esto es clasificación para estados financieros.
-- ==================================================
CREATE TABLE IF NOT EXISTS gl_account_group (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coa_id uuid NOT NULL REFERENCES chart_of_accounts(id),
  parent_group_id uuid REFERENCES gl_account_group(id),
  code varchar(30) NOT NULL,
  name varchar(160) NOT NULL,
  statement_type varchar(30) NOT NULL, -- BALANCE_SHEET, INCOME_STATEMENT, CASH_FLOW, EQUITY_CHANGES, MEMORANDUM
  classification varchar(30) NOT NULL, -- ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
  sub_classification varchar(40),      -- CURRENT, NON_CURRENT, OPERATING, FINANCIAL, ... (libre-controlado)
  sort_order integer NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coa_id, code),
  CONSTRAINT chk_gl_account_group_statement CHECK (
    statement_type IN ('BALANCE_SHEET','INCOME_STATEMENT','CASH_FLOW','EQUITY_CHANGES','MEMORANDUM')
  ),
  CONSTRAINT chk_gl_account_group_classification CHECK (
    classification IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')
  ),
  CONSTRAINT chk_gl_account_group_not_self_parent CHECK (parent_group_id IS NULL OR parent_group_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_gl_account_group_coa ON gl_account_group(coa_id);
CREATE INDEX IF NOT EXISTS idx_gl_account_group_parent ON gl_account_group(parent_group_id);

-- Enlace de cada cuenta GL a su grupo de reporte (nullable: migración gradual).
ALTER TABLE gl_account
  ADD COLUMN IF NOT EXISTS account_group_id uuid REFERENCES gl_account_group(id);

CREATE INDEX IF NOT EXISTS idx_gl_account_account_group ON gl_account(account_group_id);

-- ==================================================
-- 2. Vínculos multientidad
--    Formaliza el patrón (entity_type, entity_id) ya usado en el repo
--    (journal_entry_line.reference_type/id, accounting_document.source_type/id).
--    Permite conectar una cuenta GL o un asiento con cualquier otra entidad.
-- ==================================================
CREATE TABLE IF NOT EXISTS gl_account_entity_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gl_account_id uuid NOT NULL REFERENCES gl_account(id) ON DELETE CASCADE,
  entity_type varchar(40) NOT NULL, -- BUSINESS_PARTNER, COST_CENTER, PROFIT_CENTER, CONTRACT, LEGAL_ENTITY, TAX_CODE, BANK_ACCOUNT, ...
  entity_id uuid NOT NULL,
  relation varchar(40) NOT NULL DEFAULT 'DEFAULT', -- rol del vínculo (AR_CONTROL, ADVANCE, SURCHARGE, ...)
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gl_account_id, entity_type, entity_id, relation)
);

CREATE INDEX IF NOT EXISTS idx_gl_account_entity_link_account ON gl_account_entity_link(gl_account_id);
CREATE INDEX IF NOT EXISTS idx_gl_account_entity_link_entity ON gl_account_entity_link(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS journal_entry_entity_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL REFERENCES journal_entry(id) ON DELETE CASCADE,
  entity_type varchar(40) NOT NULL,
  entity_id uuid NOT NULL,
  relation varchar(40) NOT NULL DEFAULT 'DEFAULT',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (journal_entry_id, entity_type, entity_id, relation)
);

CREATE INDEX IF NOT EXISTS idx_journal_entry_entity_link_entry ON journal_entry_entity_link(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_entity_link_entity ON journal_entry_entity_link(entity_type, entity_id);
