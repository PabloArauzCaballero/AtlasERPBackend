DROP INDEX IF EXISTS atlas_sales.uq_merchant_users_identity_request;

ALTER TABLE atlas_sales.merchant_users
  DROP COLUMN IF EXISTS identity_request_id;
