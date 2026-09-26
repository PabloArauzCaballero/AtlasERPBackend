DROP INDEX IF EXISTS atlas_sales.ix_approval_requests_mdr_rule;

ALTER TABLE atlas_sales.approval_requests
  DROP COLUMN IF EXISTS mdr_rule_id;
