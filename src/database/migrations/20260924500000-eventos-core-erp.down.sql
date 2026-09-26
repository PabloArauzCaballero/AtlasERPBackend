-- Reversa de 20260924500000-eventos-core-erp.sql
--
-- NO destruye hechos: si ya hay cuotas mapeadas a Core, avisos que llegaron de Core, revisiones de
-- pago tardío o excepciones registradas, la reversa se NIEGA. Quitar el mapeo dejaría avisos y
-- coberturas sin saber a qué cuota de Core pertenecen; eso lo decide una persona.

DO $$
BEGIN
  IF (to_regclass('atlas_sales.core_installment_links') IS NOT NULL
        AND EXISTS (SELECT 1 FROM atlas_sales.core_installment_links))
     OR EXISTS (SELECT 1 FROM atlas_sales.consumer_payments_to_merchant WHERE core_claim_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM atlas_sales.coverage_review_items WHERE reason = 'LATE_PAYMENT_WITH_COVERAGE')
     OR (to_regclass('atlas_sales.core_event_exceptions') IS NOT NULL
        AND EXISTS (SELECT 1 FROM atlas_sales.core_event_exceptions))
     OR EXISTS (SELECT 1 FROM atlas_accounting.event_inbox WHERE outcome = 'EXCEPTION') THEN
    RAISE EXCEPTION 'Reversa rechazada: hay hechos de la integración con Core registrados.';
  END IF;
END $$;

ALTER TABLE atlas_accounting.event_inbox
  DROP CONSTRAINT IF EXISTS chk_event_inbox_outcome,
  ADD CONSTRAINT chk_event_inbox_outcome CHECK (outcome IN ('APPLIED', 'STALE'));

DROP TABLE IF EXISTS atlas_sales.core_event_exceptions;

ALTER TABLE atlas_sales.coverage_review_items
  DROP CONSTRAINT IF EXISTS ck_coverage_review_reason,
  ADD CONSTRAINT ck_coverage_review_reason CHECK (
    reason IN ('PAYMENT_NOTICE_UNRESOLVED', 'COVERAGE_WITH_PENDING_NOTICE', 'CONTRACT_NOT_ACTIVE')
  );

DROP INDEX IF EXISTS atlas_sales.uq_consumer_payments_core_claim;
ALTER TABLE atlas_sales.consumer_payments_to_merchant
  DROP COLUMN IF EXISTS core_claim_id,
  DROP COLUMN IF EXISTS core_tenant_id;

DROP TABLE IF EXISTS atlas_sales.core_installment_links;
