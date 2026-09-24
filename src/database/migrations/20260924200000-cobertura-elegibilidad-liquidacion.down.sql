-- Reversa de 20260924200000-cobertura-elegibilidad-liquidacion.sql
--
-- NO destruye hechos financieros: si ya existe una liquidación, un movimiento de recuperación, un
-- elemento de revisión o una CxP cancelada (que el índice parcial permitió reabrir), la reversa
-- se NIEGA con un error y no toca nada. Revertir en ese estado borraría pagos al comercio, cobros
-- al consumidor o la historia de un reverso; eso lo decide una persona, no un guion.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM atlas_sales.merchant_payable_settlements)
     OR EXISTS (SELECT 1 FROM atlas_sales.consumer_recovery_movements)
     OR EXISTS (SELECT 1 FROM atlas_sales.coverage_review_items)
     OR EXISTS (SELECT 1 FROM atlas_sales.merchant_payables WHERE status = 'CANCELLED') THEN
    RAISE EXCEPTION
      'Reversa rechazada: hay liquidaciones, movimientos de recuperación, revisiones o CxP canceladas registradas.';
  END IF;
END $$;

DROP TABLE IF EXISTS atlas_sales.coverage_review_items;
DROP TRIGGER IF EXISTS trg_recovery_movements_append_only ON atlas_sales.consumer_recovery_movements;
DROP TABLE IF EXISTS atlas_sales.consumer_recovery_movements;
DROP FUNCTION IF EXISTS atlas_sales.fn_recovery_movements_append_only();
DROP TABLE IF EXISTS atlas_sales.merchant_payable_settlements;

DROP INDEX IF EXISTS atlas_sales.uq_merchant_payable_live_per_installment;
ALTER TABLE atlas_sales.merchant_payables
  ADD CONSTRAINT uq_payable_per_installment UNIQUE (installment_id);

ALTER TABLE atlas_sales.merchant_payables
  DROP CONSTRAINT IF EXISTS ck_merchant_payables_cancellation,
  DROP CONSTRAINT IF EXISTS ck_merchant_payables_amount_positive;

-- Las columnas de trazabilidad se conservan: son evidencia de por qué se programó cada cobertura.
-- La reversa sólo deja de exigirlas; el código anterior las ignora.
