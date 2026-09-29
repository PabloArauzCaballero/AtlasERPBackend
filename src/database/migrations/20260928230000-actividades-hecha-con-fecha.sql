-- =====================================================================================
-- Actividades comerciales: una actividad HECHA tiene fecha de cierre — 2026-09-28
-- =====================================================================================
-- El contrato funcional dice que DONE lleva `completed_at` («hecha; completed_at dice cuándo»), pero
-- hasta hoy sólo lo garantizaba la aplicación: por SQL directo, por una importación o por un cliente
-- viejo podía quedar `status = 'DONE'` con `completed_at` NULL, y la ficha mostraba una tarea hecha
-- sin saber cuándo. Se convierte en regla de la base.
--
-- Antes del CHECK hay que sanear lo que la migración 20260928160000 dejó: su backfill marcó DONE
-- las notas y llamadas sin `due_at`, que nunca tuvieron `completed_at` (son actas de algo que ya
-- ocurrió). Para ellas la mejor fecha que existe es la del alta: `created_at`. Idempotente.
UPDATE atlas_sales.commercial_activities
   SET completed_at = created_at
 WHERE status = 'DONE'
   AND completed_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_commercial_activities_done_has_completed_at'
  ) THEN
    ALTER TABLE atlas_sales.commercial_activities
      ADD CONSTRAINT ck_commercial_activities_done_has_completed_at
      CHECK (status <> 'DONE' OR completed_at IS NOT NULL);
  END IF;
END $$;

COMMENT ON CONSTRAINT ck_commercial_activities_done_has_completed_at
  ON atlas_sales.commercial_activities IS
  'Una actividad DONE siempre dice cuándo se hizo (completed_at). PENDING y CANCELLED pueden ir sin fecha.';
