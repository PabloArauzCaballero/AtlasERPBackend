DROP INDEX IF EXISTS atlas_sales.uq_b2b_accounts_partner_profile;
ALTER TABLE atlas_sales.b2b_accounts DROP COLUMN IF EXISTS partner_profile_id;

DROP INDEX IF EXISTS atlas_sales.ix_merchant_onboarding_cases_status;
ALTER TABLE atlas_sales.merchant_onboarding_cases
  DROP COLUMN IF EXISTS identity_acknowledged_at,
  DROP COLUMN IF EXISTS decided_at,
  DROP COLUMN IF EXISTS manual_review_case_code,
  DROP COLUMN IF EXISTS decision_artifact_version,
  DROP COLUMN IF EXISTS decision_reason,
  DROP COLUMN IF EXISTS decision_outcome,
  DROP COLUMN IF EXISTS decision_execution_id,
  DROP COLUMN IF EXISTS contract_version_id;
