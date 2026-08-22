-- ATLAS - Matriz de calificación de cartera A–F (escala ASFI) para `atlas_sales`.
--
-- Sin esta política el motor NO califica: devuelve `RATING_POLICY_NOT_ACTIVE` en vez de caer a una
-- escala por defecto escrita en código. Es deliberado — una previsión calculada con umbrales que
-- nadie aprobó es indistinguible en la base de una legítima, y cuando alguien lo descubra la cartera
-- ya está calificada con dos matrices sin columna que diga cuál usó cada fila.
--
-- Los umbrales son el punto de partida operativo, no una transcripción literal de la norma para cada
-- tipo de crédito. Cambiarlos es insertar otra versión y activarla: las calificaciones ya emitidas
-- conservan su `policy_version_id` y siguen siendo reproducibles.
--
-- Idempotente.

INSERT INTO atlas_sales.rating_policy_versions (
  id, policy_code, version_code, scale_code, status, contamination_enabled, description
) VALUES (
  '00000000-0000-4000-8000-000000000101',
  'asfi_portfolio_rating',
  'v1',
  'asfi_a_f',
  'ACTIVE',
  true,
  'Escala A–F de calificación de cartera con previsión por categoría. El cliente hereda la peor categoría de sus cuentas por cobrar (arrastre).'
)
ON CONFLICT (id) DO UPDATE SET
  policy_code = EXCLUDED.policy_code,
  version_code = EXCLUDED.version_code,
  scale_code = EXCLUDED.scale_code,
  status = EXCLUDED.status,
  contamination_enabled = EXCLUDED.contamination_enabled,
  description = EXCLUDED.description,
  updated_at = now();

-- `severity_rank` 0 es la mejor categoría y es lo que decide el arrastre.
-- La última banda debe ser abierta (`max_days_past_due` nulo): si no, nadie cubre el atraso extremo.
INSERT INTO atlas_sales.rating_policy_bands (
  id, policy_version_id, grade, grade_label, severity_rank, min_days_past_due, max_days_past_due, provision_rate
) VALUES
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'A', 'Normal',                0,   0,    0, 0.0100),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000101', 'B', 'Riesgo potencial',      1,   1,   30, 0.0500),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000101', 'C', 'Deficiente',            2,  31,   60, 0.2000),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000101', 'D', 'Dudoso',                3,  61,   90, 0.5000),
  ('00000000-0000-4000-8000-000000000205', '00000000-0000-4000-8000-000000000101', 'E', 'Pérdida',               4,  91,  180, 0.8000),
  ('00000000-0000-4000-8000-000000000206', '00000000-0000-4000-8000-000000000101', 'F', 'Pérdida irrecuperable', 5, 181, NULL, 1.0000)
ON CONFLICT (id) DO UPDATE SET
  grade = EXCLUDED.grade,
  grade_label = EXCLUDED.grade_label,
  severity_rank = EXCLUDED.severity_rank,
  min_days_past_due = EXCLUDED.min_days_past_due,
  max_days_past_due = EXCLUDED.max_days_past_due,
  provision_rate = EXCLUDED.provision_rate;
