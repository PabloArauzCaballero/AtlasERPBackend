-- ATLAS - Política de calificación de cartera ASFI (A–F) como parte del esquema, no de la semilla.
--
-- Las semillas salieron del repositorio (`db:seed:pull`) y esta política quedó sólo en la base de
-- semillas: toda base que no hizo el pull —o cuyo conjunto publicado no la trae— devuelve
-- `RATING_POLICY_NOT_ACTIVE` y la pantalla «Calificación de riesgo» del ERP no puede leer la cartera.
-- Sin política el motor NO califica (no hay escala por defecto en código, a propósito), así que la
-- política es un requisito de funcionamiento, igual que las tablas.
--
-- Aditiva y sin UPDATE: si la base ya tiene una política ACTIVA para este código (la del pull, o
-- una versión nueva que alguien activó) no escribe nada. Mismos ids que la semilla, para que un
-- `db:seed:pull` posterior la reemplace fila a fila en lugar de duplicarla.
--
-- Idempotente.

INSERT INTO atlas_sales.rating_policy_versions (
  id, policy_code, version_code, scale_code, status, contamination_enabled, description
)
SELECT
  '00000000-0000-4000-8000-000000000101',
  'asfi_portfolio_rating',
  'v1',
  'asfi_a_f',
  'ACTIVE',
  true,
  'Escala A–F de calificación de cartera con previsión por categoría. El cliente hereda la peor categoría de sus cuentas por cobrar (arrastre).'
WHERE NOT EXISTS (
  SELECT 1 FROM atlas_sales.rating_policy_versions
  WHERE policy_code = 'asfi_portfolio_rating' AND status = 'ACTIVE'
)
ON CONFLICT DO NOTHING;

-- Las bandas sólo se escriben para la versión que esta migración (o la semilla, con el mismo id)
-- dejó en la base; si la política activa es otra, no se mezclan bandas ajenas con ella.
INSERT INTO atlas_sales.rating_policy_bands (
  id, policy_version_id, grade, grade_label, severity_rank, min_days_past_due, max_days_past_due, provision_rate
)
SELECT b.id, b.policy_version_id, b.grade, b.grade_label, b.severity_rank, b.min_days_past_due,
       b.max_days_past_due, b.provision_rate
FROM (VALUES
  ('00000000-0000-4000-8000-000000000201'::uuid, '00000000-0000-4000-8000-000000000101'::uuid, 'A', 'Normal',                0,   0,    0, 0.0100),
  ('00000000-0000-4000-8000-000000000202'::uuid, '00000000-0000-4000-8000-000000000101'::uuid, 'B', 'Riesgo potencial',      1,   1,   30, 0.0500),
  ('00000000-0000-4000-8000-000000000203'::uuid, '00000000-0000-4000-8000-000000000101'::uuid, 'C', 'Deficiente',            2,  31,   60, 0.2000),
  ('00000000-0000-4000-8000-000000000204'::uuid, '00000000-0000-4000-8000-000000000101'::uuid, 'D', 'Dudoso',                3,  61,   90, 0.5000),
  ('00000000-0000-4000-8000-000000000205'::uuid, '00000000-0000-4000-8000-000000000101'::uuid, 'E', 'Pérdida',               4,  91,  180, 0.8000),
  ('00000000-0000-4000-8000-000000000206'::uuid, '00000000-0000-4000-8000-000000000101'::uuid, 'F', 'Pérdida irrecuperable', 5, 181, NULL::integer, 1.0000)
) AS b(id, policy_version_id, grade, grade_label, severity_rank, min_days_past_due, max_days_past_due, provision_rate)
WHERE EXISTS (
  SELECT 1 FROM atlas_sales.rating_policy_versions v
  WHERE v.id = b.policy_version_id AND v.status = 'ACTIVE'
)
ON CONFLICT DO NOTHING;
