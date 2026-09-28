-- =====================================================================================
-- Actividades comerciales: estado PENDIENTE / HECHA / CANCELADA — 2026-09-28
-- =====================================================================================
-- Hasta hoy el estado se deducía: «tarea» si tenía due_at, «completada» si tenía completed_at.
-- No había forma de cancelar una tarea sin borrarla, ni de saber si una llamada anotada estaba
-- hecha o por hacer. Se añade `status` con su CHECK y se rellena con la MISMA regla con que la
-- pantalla las pintaba:
--   completed_at con fecha              → DONE
--   con due_at, o de tipo TASK          → PENDING
--   el resto (nota/llamada sin fecha)   → DONE   (acta de algo que ya ocurrió)
-- El CHECK va ANTES del UPDATE (una columna nueva está a NULL, que el CHECK admite) y el NOT NULL
-- después. `completed_at` no se toca. Idempotente.

ALTER TABLE atlas_sales.commercial_activities
  ADD COLUMN IF NOT EXISTS status varchar(20);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_commercial_activities_status'
  ) THEN
    ALTER TABLE atlas_sales.commercial_activities
      ADD CONSTRAINT ck_commercial_activities_status CHECK (status IN ('PENDING', 'DONE', 'CANCELLED'));
  END IF;
END $$;

UPDATE atlas_sales.commercial_activities
   SET status = CASE
     WHEN completed_at IS NOT NULL THEN 'DONE'
     WHEN due_at IS NOT NULL OR activity_type = 'TASK' THEN 'PENDING'
     ELSE 'DONE'
   END
 WHERE status IS NULL;

ALTER TABLE atlas_sales.commercial_activities
  ALTER COLUMN status SET DEFAULT 'PENDING',
  ALTER COLUMN status SET NOT NULL;

-- La tabla de la ficha de la cuenta lista por cuenta, lo más reciente primero, y filtra por estado.
CREATE INDEX IF NOT EXISTS ix_commercial_activities_account_created
  ON atlas_sales.commercial_activities (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_commercial_activities_account_status
  ON atlas_sales.commercial_activities (account_id, status);

COMMENT ON COLUMN atlas_sales.commercial_activities.status IS
  'PENDING (por hacer), DONE (hecha; completed_at dice cuándo) o CANCELLED (no se hará).';
