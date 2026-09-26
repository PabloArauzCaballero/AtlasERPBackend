-- =====================================================================================
-- Una aprobación puede esperar a una REGLA de comisión, no sólo a una propuesta.
-- =====================================================================================
-- `approval_requests` sólo sabía de propuestas (`proposal_id`) y de un `contract_version_id` sin
-- clave ajena que nadie llenaba. Una regla de comisión (`mdr_rules`) por debajo del mínimo global
-- no tenía dónde colgar su solicitud de excepción, y las reglas son lo que de verdad se cobra: la
-- propuesta pasaba por aprobación y la regla, no.
--
-- La columna es aditiva y nula por defecto: ninguna fila existente cambia y ninguna se escribe.

ALTER TABLE atlas_sales.approval_requests
  ADD COLUMN IF NOT EXISTS mdr_rule_id uuid REFERENCES atlas_sales.mdr_rules(id);

CREATE INDEX IF NOT EXISTS ix_approval_requests_mdr_rule
  ON atlas_sales.approval_requests (mdr_rule_id)
  WHERE mdr_rule_id IS NOT NULL;

COMMENT ON COLUMN atlas_sales.approval_requests.mdr_rule_id IS
  'Regla de comisión (mdr_rules) que espera esta aprobación. Al aprobarla se activa; nula si la aprobación es de una propuesta.';
