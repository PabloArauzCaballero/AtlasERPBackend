-- =====================================================================================
-- Eventos Core <-> ERP: identidad común de la cuota y consumo de payment.* (P-14 / P-08 / B20)
-- =====================================================================================
--
-- Core es la fuente de la cuota y de sus pagos; el ERP, de la cobertura, la CxP y la recuperación
-- (tabla §2.1 del plan). Hasta aquí las dos cuotas no se conocían: la compra BNPL del ERP no decía
-- de qué préstamo de Core venía y un aviso de pago de Core no tenía a qué cuota del ERP aplicarse.
--
--   1. `core_installment_links`: el mapeo EXPLÍCITO cuota del ERP <-> cuota de Core (tenant,
--      préstamo, cuota, comercio). Una cuota del ERP tiene como mucho una de Core y viceversa.
--   2. `consumer_payments_to_merchant.core_*`: el aviso que llegó de Core guarda el aviso de origen
--      (tenant + claimId). Unicidad: el mismo aviso de Core no crea dos avisos en el ERP.
--   3. `coverage_review_items.reason` admite `LATE_PAYMENT_WITH_COVERAGE`: el comercio confirmó en
--      Core un pago de una cuota que ATLAS ya cubrió o está cubriendo. No se confirma solo: doble
--      beneficio. Va a la cola de revisión.
--   4. `core_event_exceptions`: lo que llegó de Core y no se pudo aplicar sin adivinar (cuota sin
--      mapeo, moneda distinta, decisión contradictoria). Visible, con el payload, para conciliar.
--
-- Todo es AÑADIR: ninguna fila existente cambia de valor. Idempotente.

-- 1. Identidad común ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS atlas_sales.core_installment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  erp_purchase_id uuid NOT NULL REFERENCES atlas_sales.bnpl_purchases(id),
  erp_installment_id uuid NOT NULL REFERENCES atlas_sales.bnpl_installments(id),
  core_tenant_id varchar(20) NOT NULL,
  core_loan_id varchar(20) NOT NULL,
  core_installment_id varchar(20) NOT NULL,
  core_partner_profile_id varchar(20),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_core_links_numeric CHECK (
    core_tenant_id ~ '^[1-9][0-9]{0,18}$'
    AND core_loan_id ~ '^[1-9][0-9]{0,18}$'
    AND core_installment_id ~ '^[1-9][0-9]{0,18}$'
    AND (core_partner_profile_id IS NULL OR core_partner_profile_id ~ '^[1-9][0-9]{0,18}$')
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_core_links_erp_installment
  ON atlas_sales.core_installment_links (erp_installment_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_core_links_core_installment
  ON atlas_sales.core_installment_links (core_tenant_id, core_installment_id);

-- 2. Aviso de pago originado en Core ------------------------------------------------------------
ALTER TABLE atlas_sales.consumer_payments_to_merchant
  ADD COLUMN IF NOT EXISTS core_tenant_id varchar(20),
  ADD COLUMN IF NOT EXISTS core_claim_id varchar(20);
CREATE UNIQUE INDEX IF NOT EXISTS uq_consumer_payments_core_claim
  ON atlas_sales.consumer_payments_to_merchant (core_tenant_id, core_claim_id)
  WHERE core_claim_id IS NOT NULL;

-- 3. Pago tardío concurrente con cobertura -------------------------------------------------------
ALTER TABLE atlas_sales.coverage_review_items
  DROP CONSTRAINT IF EXISTS ck_coverage_review_reason,
  ADD CONSTRAINT ck_coverage_review_reason CHECK (
    reason IN (
      'PAYMENT_NOTICE_UNRESOLVED',
      'COVERAGE_WITH_PENDING_NOTICE',
      'CONTRACT_NOT_ACTIVE',
      'LATE_PAYMENT_WITH_COVERAGE'
    )
  );

-- 4. Excepciones de integración -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS atlas_sales.core_event_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key varchar(160) NOT NULL,
  topic varchar(120) NOT NULL,
  reason varchar(40) NOT NULL,
  core_tenant_id varchar(20),
  core_installment_id varchar(20),
  core_claim_id varchar(20),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_core_event_exceptions_key UNIQUE (event_key),
  CONSTRAINT ck_core_event_exceptions_reason CHECK (
    reason IN ('UNLINKED_INSTALLMENT', 'CURRENCY_MISMATCH', 'CONFLICTING_DECISION')
  )
);
CREATE INDEX IF NOT EXISTS idx_core_event_exceptions_created
  ON atlas_sales.core_event_exceptions (created_at);

-- La inbox de P-03 sólo admitía APPLIED y STALE; el consumidor de Core necesita dejar anotado que
-- un evento llegó y no se pudo aplicar (la fila vive en core_event_exceptions).
ALTER TABLE atlas_accounting.event_inbox
  DROP CONSTRAINT IF EXISTS chk_event_inbox_outcome,
  ADD CONSTRAINT chk_event_inbox_outcome CHECK (outcome IN ('APPLIED', 'STALE', 'EXCEPTION'));
