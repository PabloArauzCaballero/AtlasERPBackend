-- =====================================================================================
-- Cobertura BNPL: elegibilidad trazable, liquidación con doble control y recuperación por
-- movimientos (P-04 / P-05 del plan de cumplimiento, 2026-09-24)
-- =====================================================================================
--
-- Hasta hoy `scheduleCoverage` ponía OVERDUE y creaba la CxP ATLAS→comercio por el importe
-- ORIGINAL de cualquier cuota —futura, pagada o cancelada—, `markPayablePaid` daba por pagada la
-- CxP con una sola fecha, y la recuperación sumaba importes sin identificador de pago (repetir la
-- llamada volvía a sumar). Esta migración añade las piezas que el código necesita para no hacerlo:
--
--   1. `merchant_payables`: quién pidió la cobertura, con qué versión contractual, con qué fecha de
--      negocio y con qué evidencia de elegibilidad; moneda; y cancelación sin borrar la fila.
--      La unicidad «una CxP por cuota» pasa a ser «una CxP VIVA por cuota» (índice parcial), para
--      que un reverso deje la historia y permita reabrir.
--   2. `merchant_payable_settlements`: la liquidación externa al comercio. Referencia única, importe,
--      moneda, beneficiario, fecha y evidencia (archivo del ERP). Nace PENDING_APPROVAL y sólo otra
--      persona la confirma (CHECK: quien decide ≠ quien registra).
--   3. `consumer_recovery_movements`: cada cobro de recuperación es un movimiento con
--      `payment_reference` único; el reverso es un movimiento compensatorio. Sólo se inserta.
--   4. `coverage_review_items`: la cola de revisión visible (avisos de pago sin resolver, cobertura
--      pedida sobre una cuota con aviso pendiente, contrato no activo).
--
-- Todo es AÑADIR: ninguna fila existente cambia de valor. Idempotente: se puede aplicar dos veces.

-- 1. CxP ATLAS→comercio -------------------------------------------------------------------------
ALTER TABLE atlas_sales.merchant_payables
  ADD COLUMN IF NOT EXISTS currency char(3) NOT NULL DEFAULT 'BOB',
  ADD COLUMN IF NOT EXISTS requested_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS contract_version_id uuid REFERENCES atlas_sales.contract_versions(id),
  ADD COLUMN IF NOT EXISTS business_date date,
  ADD COLUMN IF NOT EXISTS eligibility_evidence jsonb,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS cancellation_reason varchar(240);

-- NOT VALID: protege lo que se escriba desde ahora sin juzgar filas históricas.
ALTER TABLE atlas_sales.merchant_payables
  DROP CONSTRAINT IF EXISTS ck_merchant_payables_amount_positive,
  ADD CONSTRAINT ck_merchant_payables_amount_positive CHECK (amount > 0) NOT VALID;

ALTER TABLE atlas_sales.merchant_payables
  DROP CONSTRAINT IF EXISTS ck_merchant_payables_cancellation,
  ADD CONSTRAINT ck_merchant_payables_cancellation
  CHECK (status <> 'CANCELLED' OR cancelled_at IS NOT NULL) NOT VALID;

-- Una CxP viva por cuota. La cancelada se conserva y deja de contar.
ALTER TABLE atlas_sales.merchant_payables DROP CONSTRAINT IF EXISTS uq_payable_per_installment;
CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_payable_live_per_installment
  ON atlas_sales.merchant_payables (installment_id)
  WHERE status <> 'CANCELLED';

ALTER TABLE atlas_sales.consumer_recovery_receivables
  ADD COLUMN IF NOT EXISTS currency char(3) NOT NULL DEFAULT 'BOB';

-- 2. Liquidación de la CxP al comercio ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS atlas_sales.merchant_payable_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_payable_id uuid NOT NULL REFERENCES atlas_sales.merchant_payables(id),
  settlement_reference varchar(120) NOT NULL,
  amount numeric(18,2) NOT NULL,
  currency char(3) NOT NULL,
  beneficiary_account_id uuid NOT NULL REFERENCES atlas_sales.b2b_accounts(id),
  paid_at timestamptz NOT NULL,
  evidence_file_id uuid NOT NULL REFERENCES atlas_accounting.erp_file(id),
  status varchar(30) NOT NULL DEFAULT 'PENDING_APPROVAL',
  registered_by_user_id uuid NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT now(),
  decided_by_user_id uuid,
  decided_at timestamptz,
  decision_note varchar(240),
  CONSTRAINT ck_payable_settlement_amount CHECK (amount > 0),
  CONSTRAINT ck_payable_settlement_status
    CHECK (status IN ('PENDING_APPROVAL', 'CONFIRMED', 'REJECTED')),
  CONSTRAINT ck_payable_settlement_decision
    CHECK (status = 'PENDING_APPROVAL' OR (decided_by_user_id IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT ck_payable_settlement_four_eyes
    CHECK (decided_by_user_id IS NULL OR decided_by_user_id <> registered_by_user_id)
);

-- La referencia bancaria identifica UN pago: no puede liquidar dos CxP ni repetirse. Una
-- liquidación rechazada (mal cargada) libera su referencia.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payable_settlement_reference
  ON atlas_sales.merchant_payable_settlements (settlement_reference)
  WHERE status <> 'REJECTED';

CREATE UNIQUE INDEX IF NOT EXISTS uq_payable_settlement_live_per_payable
  ON atlas_sales.merchant_payable_settlements (merchant_payable_id)
  WHERE status <> 'REJECTED';

-- 3. Movimientos de recuperación ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS atlas_sales.consumer_recovery_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recovery_id uuid NOT NULL REFERENCES atlas_sales.consumer_recovery_receivables(id),
  installment_id uuid NOT NULL REFERENCES atlas_sales.bnpl_installments(id),
  movement_type varchar(20) NOT NULL,
  payment_reference varchar(120) NOT NULL,
  amount numeric(18,2) NOT NULL,
  currency char(3) NOT NULL,
  reverses_movement_id uuid REFERENCES atlas_sales.consumer_recovery_movements(id),
  received_at timestamptz NOT NULL,
  recorded_by_user_id uuid,
  reason varchar(240),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_recovery_movement_type CHECK (movement_type IN ('PAYMENT', 'REVERSAL')),
  CONSTRAINT ck_recovery_movement_amount CHECK (amount > 0),
  CONSTRAINT ck_recovery_movement_reversal
    CHECK ((movement_type = 'REVERSAL') = (reverses_movement_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_recovery_movement_reference
  ON atlas_sales.consumer_recovery_movements (payment_reference);

-- Un pago se revierte una sola vez.
CREATE UNIQUE INDEX IF NOT EXISTS uq_recovery_movement_reverses
  ON atlas_sales.consumer_recovery_movements (reverses_movement_id)
  WHERE reverses_movement_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recovery_movement_recovery
  ON atlas_sales.consumer_recovery_movements (recovery_id, created_at);

-- Historia inmutable: un movimiento no se edita ni se borra; se compensa con otro.
CREATE OR REPLACE FUNCTION atlas_sales.fn_recovery_movements_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'consumer_recovery_movements es de sólo inserción (%): registra un movimiento compensatorio', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_recovery_movements_append_only ON atlas_sales.consumer_recovery_movements;
CREATE TRIGGER trg_recovery_movements_append_only
  BEFORE UPDATE OR DELETE ON atlas_sales.consumer_recovery_movements
  FOR EACH ROW EXECUTE FUNCTION atlas_sales.fn_recovery_movements_append_only();

-- 4. Cola de revisión de cobertura --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS atlas_sales.coverage_review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installment_id uuid NOT NULL REFERENCES atlas_sales.bnpl_installments(id),
  reason varchar(60) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'OPEN',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  opened_by_user_id uuid,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by_user_id uuid,
  resolution_note varchar(240),
  CONSTRAINT ck_coverage_review_reason CHECK (
    reason IN ('PAYMENT_NOTICE_UNRESOLVED', 'COVERAGE_WITH_PENDING_NOTICE', 'CONTRACT_NOT_ACTIVE')
  ),
  CONSTRAINT ck_coverage_review_status CHECK (status IN ('OPEN', 'RESOLVED')),
  CONSTRAINT ck_coverage_review_resolution CHECK (status = 'OPEN' OR resolved_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_coverage_review_open
  ON atlas_sales.coverage_review_items (installment_id, reason)
  WHERE status = 'OPEN';
