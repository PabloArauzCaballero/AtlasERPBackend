-- ATLAS B2B Sales/CRM - Portal de comercio
-- Planes de suscripción (tipo panel Meta) y suscripción activa por comercio.
-- Ejecutar en PostgreSQL 14+. Idempotente.

CREATE SCHEMA IF NOT EXISTS atlas_sales;

CREATE TABLE IF NOT EXISTS atlas_sales.merchant_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(40) NOT NULL UNIQUE,
  name varchar(120) NOT NULL,
  description text,
  tier varchar(30) NOT NULL DEFAULT 'STANDARD',
  monthly_price numeric(18, 2) NOT NULL DEFAULT 0,
  currency char(3) NOT NULL DEFAULT 'BOB',
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atlas_sales.merchant_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_account_id uuid NOT NULL REFERENCES atlas_sales.b2b_accounts(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES atlas_sales.merchant_plans(id),
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  auto_renew boolean NOT NULL DEFAULT true,
  started_at timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz,
  selected_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchant_subscriptions_account ON atlas_sales.merchant_subscriptions(merchant_account_id);
-- Una sola suscripción ACTIVE por comercio.
CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_subscription_active
  ON atlas_sales.merchant_subscriptions(merchant_account_id)
  WHERE status = 'ACTIVE';

-- Planes semilla (idempotente por code).
INSERT INTO atlas_sales.merchant_plans (code, name, description, tier, monthly_price, currency, features, sort_order)
VALUES
  ('STARTER', 'Starter', 'Ideal para comercios que inician su operación digital.', 'STARTER', 0, 'BOB',
   '["1 sucursal","Registro de ventas BNPL","Reportes básicos","Soporte por correo"]'::jsonb, 1),
  ('GROWTH', 'Growth', 'Para comercios en expansión con múltiples sucursales.', 'STANDARD', 349, 'BOB',
   '["Hasta 5 sucursales","Campañas de publicidad básicas","Panel de consumo y facturación","Soporte prioritario"]'::jsonb, 2),
  ('SCALE', 'Scale', 'Operación multi-sucursal con control de campañas avanzado.', 'PREMIUM', 899, 'BOB',
   '["Sucursales ilimitadas","Segmentación de campañas avanzada","Facturación consolidada","Gerente de cuenta dedicado"]'::jsonb, 3)
ON CONFLICT (code) DO NOTHING;
