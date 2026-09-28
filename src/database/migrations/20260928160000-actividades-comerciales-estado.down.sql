-- Reversa de 20260928160000-actividades-comerciales-estado.sql.
-- Se pierde la distinción CANCELADA/PENDIENTE: el estado vuelve a deducirse de due_at y
-- completed_at, que la ida nunca tocó.
DROP INDEX IF EXISTS atlas_sales.ix_commercial_activities_account_status;
DROP INDEX IF EXISTS atlas_sales.ix_commercial_activities_account_created;
ALTER TABLE atlas_sales.commercial_activities
  DROP CONSTRAINT IF EXISTS ck_commercial_activities_status;
ALTER TABLE atlas_sales.commercial_activities
  DROP COLUMN IF EXISTS status;
