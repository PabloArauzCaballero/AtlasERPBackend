-- Reversa de 20260817120000-portal-merchant-scope-hardening.sql
-- Deja el esquema en el estado previo al endurecimiento del portal del comercio.
-- Idempotente. No borra datos de negocio salvo las columnas introducidas por la migración.

-- 5. Índices del panel de facturación
DROP INDEX IF EXISTS atlas_sales.idx_merchant_receivables_account_issued;
DROP INDEX IF EXISTS atlas_sales.idx_merchant_invoices_account_date;

-- 4. Suscripciones
DROP INDEX IF EXISTS atlas_sales.uq_merchant_subscriptions_active_account;
DROP INDEX IF EXISTS atlas_sales.idx_merchant_subscriptions_account_status;
ALTER TABLE atlas_sales.merchant_subscriptions
  DROP CONSTRAINT IF EXISTS ck_merchant_subscriptions_period,
  DROP CONSTRAINT IF EXISTS ck_merchant_subscriptions_ended_at,
  DROP CONSTRAINT IF EXISTS ck_merchant_subscriptions_status,
  DROP COLUMN IF EXISTS ended_by_user_id,
  DROP COLUMN IF EXISTS ended_at,
  DROP COLUMN IF EXISTS updated_at;

-- 3. Planes
ALTER TABLE atlas_sales.merchant_plans
  DROP CONSTRAINT IF EXISTS ck_merchant_plans_currency,
  DROP CONSTRAINT IF EXISTS ck_merchant_plans_price,
  DROP CONSTRAINT IF EXISTS ck_merchant_plans_tier,
  DROP CONSTRAINT IF EXISTS ck_merchant_plans_status,
  DROP COLUMN IF EXISTS updated_at;

-- 2. Anunciante -> cuenta B2B
DROP INDEX IF EXISTS idx_ad_advertiser_users_email;
DROP INDEX IF EXISTS idx_ad_advertiser_users_user;
DROP INDEX IF EXISTS idx_ad_advertiser_merchant_account;
ALTER TABLE ad_advertiser_accounts
  DROP CONSTRAINT IF EXISTS fk_ad_advertiser_merchant_account,
  DROP COLUMN IF EXISTS merchant_account_id;

-- 1. Identidad del usuario del comercio
DROP INDEX IF EXISTS atlas_sales.uq_merchant_users_account_user;
DROP INDEX IF EXISTS atlas_sales.idx_merchant_users_email_normalized;
DROP INDEX IF EXISTS atlas_sales.idx_merchant_users_user_id;
ALTER TABLE atlas_sales.merchant_users
  DROP CONSTRAINT IF EXISTS ck_merchant_users_status,
  DROP COLUMN IF EXISTS email_normalized,
  DROP COLUMN IF EXISTS user_id;
