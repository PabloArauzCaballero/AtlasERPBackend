-- ATLAS Accounting - SAP-like hardening layer
-- Ejecutar después de 001_schema_atlas_accounting.sql.
-- PostgreSQL 14+.

SET search_path TO atlas_accounting;

-- =============================
-- 1. Estados y consistencia básica
-- =============================

ALTER TABLE accounting_period
  ADD CONSTRAINT chk_accounting_period_close_status
  CHECK (close_status IN ('OPEN', 'CLOSED', 'REOPENED'));

ALTER TABLE ledger
  ADD CONSTRAINT chk_ledger_accounting_basis
  CHECK (accounting_basis IN ('LOCAL_BO', 'MANAGEMENT', 'IFRS')),
  ADD CONSTRAINT chk_ledger_status
  CHECK (status IN ('ACTIVE', 'INACTIVE'));

ALTER TABLE accounting_document
  ADD CONSTRAINT chk_accounting_document_status
  CHECK (status IN ('DRAFT', 'POSTED', 'REVERSED', 'VOID')),
  ADD CONSTRAINT chk_accounting_document_approval_status
  CHECK (approval_status IN ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'));

ALTER TABLE journal_entry
  ADD CONSTRAINT chk_journal_entry_posting_status
  CHECK (posting_status IN ('DRAFT', 'POSTED', 'REVERSED', 'VOID'));

ALTER TABLE business_partner
  ADD CONSTRAINT chk_bp_status
  CHECK (status IN ('ACTIVE', 'INACTIVE', 'BLOCKED')),
  ADD CONSTRAINT chk_bp_type
  CHECK (partner_type IN ('PERSON', 'COMPANY', 'BANK', 'GROUP_ENTITY', 'GOVERNMENT'));

ALTER TABLE business_partner_role
  ADD CONSTRAINT chk_bp_role_status
  CHECK (status IN ('ACTIVE', 'INACTIVE')),
  ADD CONSTRAINT chk_bp_role_dates
  CHECK (effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE gl_account
  ADD CONSTRAINT chk_gl_account_status
  CHECK (status IN ('ACTIVE', 'INACTIVE')),
  ADD CONSTRAINT chk_gl_account_type
  CHECK (account_type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE', 'CONTRA_ASSET'));

ALTER TABLE ar_invoice
  ADD CONSTRAINT chk_ar_invoice_amounts
  CHECK (net_amount >= 0 AND tax_amount >= 0 AND gross_amount = net_amount + tax_amount),
  ADD CONSTRAINT chk_ar_invoice_status
  CHECK (status IN ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CREDITED', 'VOID'));

ALTER TABLE receipt
  ADD CONSTRAINT chk_receipt_status
  CHECK (status IN ('DRAFT', 'RECORDED', 'POSTED', 'VOID'));

ALTER TABLE close_run
  ADD CONSTRAINT chk_close_run_status
  CHECK (status IN ('STARTED', 'COMPLETED', 'FAILED', 'VOID'));

-- Solo un ledger por defecto por entidad legal y base contable.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_default_per_basis
  ON ledger(legal_entity_id, accounting_basis)
  WHERE is_default = true;

-- Idempotencia comercial: un evento externo no puede entrar dos veces para el mismo contrato.
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_event_contract_external_ref
  ON billing_event(contract_id, external_ref)
  WHERE external_ref IS NOT NULL;

-- Una factura AR debe tener como máximo un documento fiscal electrónico activo en este MVP.
CREATE UNIQUE INDEX IF NOT EXISTS uq_einvoice_ar_invoice
  ON electronic_tax_document(ar_invoice_id);

-- Un documento publicado solo puede tener un reverso activo. Esta restricción evita doble reversión.
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_document_single_reversal
  ON accounting_document(reversal_of_id)
  WHERE reversal_of_id IS NOT NULL AND status <> 'VOID';

-- =============================
-- 2. Consistencia ledger / período / entidad legal
-- =============================

CREATE OR REPLACE FUNCTION fn_assert_accounting_document_context()
RETURNS trigger AS $$
DECLARE
  v_period record;
  v_ledger record;
BEGIN
  SELECT p.id, p.start_date, p.end_date, p.is_open, p.close_status, fy.legal_entity_id
    INTO v_period
  FROM accounting_period p
  INNER JOIN fiscal_year fy ON fy.id = p.fiscal_year_id
  WHERE p.id = NEW.accounting_period_id;

  IF v_period.id IS NULL THEN
    RAISE EXCEPTION 'ACCOUNTING_PERIOD_NOT_FOUND';
  END IF;

  IF v_period.legal_entity_id <> NEW.legal_entity_id THEN
    RAISE EXCEPTION 'PERIOD_LEGAL_ENTITY_MISMATCH';
  END IF;

  IF NEW.posting_date < v_period.start_date OR NEW.posting_date > v_period.end_date THEN
    RAISE EXCEPTION 'POSTING_DATE_OUTSIDE_PERIOD';
  END IF;

  IF v_period.is_open IS NOT TRUE OR v_period.close_status <> 'OPEN' THEN
    RAISE EXCEPTION 'ACCOUNTING_PERIOD_CLOSED';
  END IF;

  SELECT id, legal_entity_id, status INTO v_ledger
  FROM ledger
  WHERE id = NEW.ledger_id;

  IF v_ledger.id IS NULL THEN
    RAISE EXCEPTION 'LEDGER_NOT_FOUND';
  END IF;

  IF v_ledger.legal_entity_id <> NEW.legal_entity_id THEN
    RAISE EXCEPTION 'LEDGER_LEGAL_ENTITY_MISMATCH';
  END IF;

  IF v_ledger.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'LEDGER_NOT_ACTIVE';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_accounting_document_context ON accounting_document;
CREATE TRIGGER trg_accounting_document_context
BEFORE INSERT OR UPDATE ON accounting_document
FOR EACH ROW
WHEN (NEW.status NOT IN ('VOID', 'REVERSED'))
EXECUTE FUNCTION fn_assert_accounting_document_context();

-- =============================
-- 3. Dimensiones obligatorias por cuenta GL
-- =============================

CREATE OR REPLACE FUNCTION fn_assert_journal_line_dimensions()
RETURNS trigger AS $$
DECLARE
  v_account record;
BEGIN
  SELECT id, status, is_control_account, requires_partner, requires_cost_center,
         requires_profit_center, requires_tax_code
    INTO v_account
  FROM gl_account
  WHERE id = NEW.gl_account_id;

  IF v_account.id IS NULL THEN
    RAISE EXCEPTION 'GL_ACCOUNT_NOT_FOUND';
  END IF;

  IF v_account.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'GL_ACCOUNT_NOT_ACTIVE';
  END IF;

  IF v_account.requires_partner IS TRUE AND NEW.partner_id IS NULL THEN
    RAISE EXCEPTION 'PARTNER_REQUIRED_FOR_GL_ACCOUNT';
  END IF;

  IF v_account.requires_cost_center IS TRUE AND NEW.cost_center_id IS NULL THEN
    RAISE EXCEPTION 'COST_CENTER_REQUIRED_FOR_GL_ACCOUNT';
  END IF;

  IF v_account.requires_profit_center IS TRUE AND NEW.profit_center_id IS NULL THEN
    RAISE EXCEPTION 'PROFIT_CENTER_REQUIRED_FOR_GL_ACCOUNT';
  END IF;

  IF v_account.requires_tax_code IS TRUE AND NEW.tax_code_id IS NULL THEN
    RAISE EXCEPTION 'TAX_CODE_REQUIRED_FOR_GL_ACCOUNT';
  END IF;

  IF v_account.is_control_account IS TRUE
     AND COALESCE(NEW.reference_type, '') NOT IN (
       'AR_INVOICE', 'AP_INVOICE', 'RECEIPT', 'SUPPLIER_PAYMENT',
       'LOAN', 'ASSET', 'PROVISION', 'REVERSAL', 'INTERCOMPANY'
     ) THEN
    RAISE EXCEPTION 'CONTROL_ACCOUNT_REQUIRES_SUBLEDGER_REFERENCE';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_journal_line_dimensions ON journal_entry_line;
CREATE TRIGGER trg_journal_line_dimensions
BEFORE INSERT OR UPDATE ON journal_entry_line
FOR EACH ROW
EXECUTE FUNCTION fn_assert_journal_line_dimensions();

-- =============================
-- 4. Balance diferido de asientos
-- =============================

CREATE OR REPLACE FUNCTION fn_assert_journal_balanced()
RETURNS trigger AS $$
DECLARE
  v_journal_id uuid;
  v_debit numeric(18,2);
  v_credit numeric(18,2);
BEGIN
  v_journal_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);

  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
    INTO v_debit, v_credit
  FROM journal_entry_line
  WHERE journal_entry_id = v_journal_id;

  IF v_debit <> v_credit THEN
    RAISE EXCEPTION 'UNBALANCED_JOURNAL debit=% credit=%', v_debit, v_credit;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_journal_balanced ON journal_entry_line;
CREATE CONSTRAINT TRIGGER trg_journal_balanced
AFTER INSERT OR UPDATE OR DELETE ON journal_entry_line
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_assert_journal_balanced();

-- =============================
-- 5. Inmutabilidad contable una vez publicado
-- =============================

CREATE OR REPLACE FUNCTION fn_block_update_of_posted_accounting_document()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'POSTED' THEN
    -- Única mutación permitida en documento publicado: marcarlo como REVERSED y enlazar el documento reverso.
    IF NEW.status = 'REVERSED'
       AND NEW.reversed_by_id IS NOT NULL
       AND NEW.legal_entity_id = OLD.legal_entity_id
       AND NEW.source_system = OLD.source_system
       AND NEW.source_type = OLD.source_type
       AND NEW.source_id = OLD.source_id
       AND NEW.document_type = OLD.document_type
       AND NEW.document_no = OLD.document_no
       AND NEW.document_date = OLD.document_date
       AND NEW.posting_date = OLD.posting_date
       AND NEW.accounting_period_id = OLD.accounting_period_id
       AND NEW.ledger_id = OLD.ledger_id
       AND NEW.currency_code = OLD.currency_code
       AND NEW.approval_status = OLD.approval_status
       AND NEW.reversal_of_id IS NOT DISTINCT FROM OLD.reversal_of_id
       AND NEW.policy_snapshot_id IS NOT DISTINCT FROM OLD.policy_snapshot_id
       AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
       AND NEW.created_at = OLD.created_at THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'POSTED_ACCOUNTING_DOCUMENT_IS_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_posted_accounting_document_immutable ON accounting_document;
CREATE TRIGGER trg_posted_accounting_document_immutable
BEFORE UPDATE ON accounting_document
FOR EACH ROW
EXECUTE FUNCTION fn_block_update_of_posted_accounting_document();

CREATE OR REPLACE FUNCTION fn_block_update_of_posted_journal_entry()
RETURNS trigger AS $$
BEGIN
  IF OLD.posting_status = 'POSTED' THEN
    -- Única mutación permitida: estado POSTED -> REVERSED. No se alteran importes ni hash.
    IF NEW.posting_status = 'REVERSED'
       AND NEW.accounting_document_id = OLD.accounting_document_id
       AND NEW.journal_no = OLD.journal_no
       AND NEW.posted_at IS NOT DISTINCT FROM OLD.posted_at
       AND NEW.posted_by IS NOT DISTINCT FROM OLD.posted_by
       AND NEW.hash_sha256 IS NOT DISTINCT FROM OLD.hash_sha256
       AND NEW.created_at = OLD.created_at THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'POSTED_JOURNAL_ENTRY_IS_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_posted_journal_entry_immutable ON journal_entry;
CREATE TRIGGER trg_posted_journal_entry_immutable
BEFORE UPDATE ON journal_entry
FOR EACH ROW
EXECUTE FUNCTION fn_block_update_of_posted_journal_entry();

CREATE OR REPLACE FUNCTION fn_block_journal_line_change_when_posted()
RETURNS trigger AS $$
DECLARE
  v_status varchar(20);
  v_journal_id uuid;
BEGIN
  v_journal_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
  SELECT posting_status INTO v_status FROM journal_entry WHERE id = v_journal_id;

  IF v_status = 'POSTED' THEN
    RAISE EXCEPTION 'POSTED_JOURNAL_LINES_ARE_IMMUTABLE';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_posted_journal_line_immutable_update ON journal_entry_line;
CREATE TRIGGER trg_posted_journal_line_immutable_update
BEFORE UPDATE OR DELETE ON journal_entry_line
FOR EACH ROW
EXECUTE FUNCTION fn_block_journal_line_change_when_posted();

CREATE OR REPLACE FUNCTION fn_block_audit_log_change()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'DOCUMENT_AUDIT_LOG_IS_IMMUTABLE';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_document_audit_log_immutable ON document_audit_log;
CREATE TRIGGER trg_document_audit_log_immutable
BEFORE UPDATE OR DELETE ON document_audit_log
FOR EACH ROW
EXECUTE FUNCTION fn_block_audit_log_change();


-- =============================
-- 6. Cierre multi-entidad consistente
-- =============================

CREATE OR REPLACE FUNCTION fn_assert_close_run_context()
RETURNS trigger AS $$
DECLARE
  v_legal_entity_id uuid;
BEGIN
  SELECT fy.legal_entity_id INTO v_legal_entity_id
  FROM accounting_period p
  INNER JOIN fiscal_year fy ON fy.id = p.fiscal_year_id
  WHERE p.id = NEW.period_id;

  IF v_legal_entity_id IS NULL THEN
    RAISE EXCEPTION 'ACCOUNTING_PERIOD_NOT_FOUND';
  END IF;

  IF v_legal_entity_id <> NEW.legal_entity_id THEN
    RAISE EXCEPTION 'CLOSE_RUN_LEGAL_ENTITY_PERIOD_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_close_run_context ON close_run;
CREATE TRIGGER trg_close_run_context
BEFORE INSERT OR UPDATE ON close_run
FOR EACH ROW
EXECUTE FUNCTION fn_assert_close_run_context();

-- =============================
-- 7. Asignación AR contra saldo abierto
-- =============================

CREATE OR REPLACE FUNCTION fn_assert_receipt_allocation_open_balance()
RETURNS trigger AS $$
DECLARE
  v_gross numeric(18,2);
  v_allocated numeric(18,2);
BEGIN
  SELECT gross_amount INTO v_gross
  FROM ar_invoice
  WHERE id = NEW.ar_invoice_id
  FOR UPDATE;

  IF v_gross IS NULL THEN
    RAISE EXCEPTION 'AR_INVOICE_NOT_FOUND';
  END IF;

  SELECT COALESCE(SUM(allocated_amount), 0)
    INTO v_allocated
  FROM receipt_allocation
  WHERE ar_invoice_id = NEW.ar_invoice_id
    AND id <> COALESCE(NEW.id, gen_random_uuid());

  IF v_allocated + NEW.allocated_amount > v_gross THEN
    RAISE EXCEPTION 'AR_INVOICE_ALLOCATION_EXCEEDS_OPEN_BALANCE';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_receipt_allocation_open_balance ON receipt_allocation;
CREATE TRIGGER trg_receipt_allocation_open_balance
BEFORE INSERT OR UPDATE ON receipt_allocation
FOR EACH ROW
EXECUTE FUNCTION fn_assert_receipt_allocation_open_balance();
