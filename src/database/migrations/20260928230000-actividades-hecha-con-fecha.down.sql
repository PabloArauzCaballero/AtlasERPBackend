-- Reversa de 20260928230000-actividades-hecha-con-fecha.sql.
-- Se quita la regla; las fechas rellenadas (completed_at = created_at en las DONE que no tenían) se
-- conservan: son datos válidos y no hay forma de distinguirlas de las escritas por la aplicación.
ALTER TABLE atlas_sales.commercial_activities
  DROP CONSTRAINT IF EXISTS ck_commercial_activities_done_has_completed_at;
