-- =====================================================================================
-- El caso de onboarding guarda en qué punto de la cadena está, y con qué contrato.
-- =====================================================================================
-- El alta de un comercio es UNA cadena con cuatro tramos y cuatro dueños: el ERP origina y pide,
-- el Motor de decisión decide (KYB), el portal interno concede la identidad, y el ERP recibe el
-- acuse y opera. Hasta aquí el caso sólo sabía decir «abierto» o «completado», y nada de lo que
-- pasaba en los otros tres tramos dejaba huella en él: la pantalla no podía responder «¿qué le
-- falta a este comercio?» sin ir a preguntar a dos sistemas.
--
-- Columnas del Motor (`decision_*`, `manual_review_case_code`, `decided_at`): lo que devolvió
-- `POST /operations/partners/:partnerId/kyb-review` de AtlasBackend, que es el ÚNICO origen de esa
-- decisión. Se guarda el desenlace y el identificador de la ejecución, no las variables: la
-- evidencia vive en el expediente de AtlasBackend y en la traza del Motor.
--
-- `identity_acknowledged_at`: cuándo el ERP se enteró de que el portal concedió las credenciales.
-- Es el acuse que antes no llegaba nunca.
--
-- `contract_version_id`: el contrato del caso. Antes la activación miraba «el contrato activo de
-- la cuenta» y no había forma de decir «este comercio va con ESTA versión»; la comisión (MDR) cuelga
-- de la versión del contrato, así que sin esto tampoco se podía pactar la comisión del alta.
--
-- `b2b_accounts.partner_profile_id`: el puente hacia el expediente del comercio en AtlasBackend
-- (`partner_profiles._id`). Opaco (AtlasBackend emite bigints). Es lo que permite pedir la
-- verificación: sin él no hay a quién preguntar.

ALTER TABLE atlas_sales.merchant_onboarding_cases
  ADD COLUMN IF NOT EXISTS contract_version_id uuid REFERENCES atlas_sales.contract_versions(id),
  ADD COLUMN IF NOT EXISTS decision_execution_id varchar(120),
  ADD COLUMN IF NOT EXISTS decision_outcome varchar(40),
  ADD COLUMN IF NOT EXISTS decision_reason varchar(240),
  ADD COLUMN IF NOT EXISTS decision_artifact_version varchar(120),
  ADD COLUMN IF NOT EXISTS manual_review_case_code varchar(120),
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS identity_acknowledged_at timestamptz;

COMMENT ON COLUMN atlas_sales.merchant_onboarding_cases.contract_version_id IS
  'Versión de contrato pactada para este alta. Nula: la activación usa la versión activa de la cuenta.';
COMMENT ON COLUMN atlas_sales.merchant_onboarding_cases.decision_execution_id IS
  'Ejecución del artefacto PARTNER_KYB_REVIEW en el Motor, vía AtlasBackend. Opaco.';
COMMENT ON COLUMN atlas_sales.merchant_onboarding_cases.decision_outcome IS
  'APROBADO | RECHAZADO | REVISION_MANUAL, tal como lo publicó el Motor.';
COMMENT ON COLUMN atlas_sales.merchant_onboarding_cases.manual_review_case_code IS
  'Caso de revisión manual abierto por el Motor, si lo hubo.';
COMMENT ON COLUMN atlas_sales.merchant_onboarding_cases.identity_acknowledged_at IS
  'Cuándo el ERP acusó que el portal concedió las credenciales del comercio.';

-- La cola filtra por estado en cada carga de pantalla.
CREATE INDEX IF NOT EXISTS ix_merchant_onboarding_cases_status
  ON atlas_sales.merchant_onboarding_cases(status);

ALTER TABLE atlas_sales.b2b_accounts
  ADD COLUMN IF NOT EXISTS partner_profile_id varchar(64);

COMMENT ON COLUMN atlas_sales.b2b_accounts.partner_profile_id IS
  'Expediente del comercio en AtlasBackend (partner_profiles._id). Opaco. Nulo mientras no se haya enlazado.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_b2b_accounts_partner_profile
  ON atlas_sales.b2b_accounts(partner_profile_id)
  WHERE partner_profile_id IS NOT NULL;
