-- ATLAS Portal del comercio — endurecimiento del modelo de propiedad y consistencia.
--
-- Motivación: el portal (`/api/v1/portal/*`) es el único punto donde el usuario partner opera
-- simultáneamente CRM (`atlas_sales`), contabilidad y publicidad (`ad_*`). Antes de esta migración
-- el modelo NO podía expresar a qué comercio pertenece un usuario autenticado ni qué anunciante
-- pertenece a qué comercio, por lo que toda autorización por tenant era imposible y los endpoints
-- del portal quedaban expuestos a acceso cruzado entre comercios.
--
-- Las restricciones CHECK sobre tablas que ya pueden tener datos se agregan como NOT VALID: rigen
-- para toda escritura nueva sin abortar la migración por filas heredadas. Se pueden promover con
-- `VALIDATE CONSTRAINT` una vez saneado el histórico.
--
-- Ejecutar en PostgreSQL 14+. Idempotente.

-- =====================================================================================
-- 1. Identidad del usuario del comercio  ->  cuenta B2B
-- =====================================================================================
-- `merchant_users` solo guardaba el correo. El JWT emitido por el auth-gateway trae `sub`
-- (id de usuario en AtlasBackend) y `email`. Se agrega `user_id` para enlazar por identidad
-- estable, y una columna normalizada de correo para el enlace de respaldo sin depender de
-- mayúsculas/minúsculas ni de espacios accidentales.
ALTER TABLE atlas_sales.merchant_users
  ADD COLUMN IF NOT EXISTS user_id uuid;

ALTER TABLE atlas_sales.merchant_users
  ADD COLUMN IF NOT EXISTS email_normalized varchar(180)
    GENERATED ALWAYS AS (lower(btrim(email))) STORED;

CREATE INDEX IF NOT EXISTS idx_merchant_users_user_id
  ON atlas_sales.merchant_users(user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_merchant_users_email_normalized
  ON atlas_sales.merchant_users(email_normalized);

-- Un mismo `user_id` no puede estar dos veces en la misma cuenta.
CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_users_account_user
  ON atlas_sales.merchant_users(account_id, user_id)
  WHERE user_id IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE atlas_sales.merchant_users
    ADD CONSTRAINT ck_merchant_users_status
    CHECK (status IN ('INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================================================
-- 2. Anunciante de publicidad  ->  cuenta B2B del ERP
-- =====================================================================================
-- Sin esta columna el portal no puede decidir qué campañas ve o controla un comercio, y
-- `GET /portal/advertisers` degeneraba en un volcado global de anunciantes.
ALTER TABLE ad_advertiser_accounts
  ADD COLUMN IF NOT EXISTS merchant_account_id uuid;

DO $$ BEGIN
  ALTER TABLE ad_advertiser_accounts
    ADD CONSTRAINT fk_ad_advertiser_merchant_account
    FOREIGN KEY (merchant_account_id) REFERENCES atlas_sales.b2b_accounts(id)
    ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_ad_advertiser_merchant_account
  ON ad_advertiser_accounts(merchant_account_id)
  WHERE merchant_account_id IS NOT NULL;

-- Enlace best-effort por NIT/tax id + país para el inventario ya existente. Solo llena filas
-- sin enlazar y solo cuando la correspondencia es exacta y única en ambos lados. Los anunciantes
-- que queden sin enlazar simplemente no son visibles desde el portal (fail-closed).
UPDATE ad_advertiser_accounts AS adv
SET merchant_account_id = link.account_id
FROM (
  -- `(array_agg(...))[1]` y no `min(...)`: PostgreSQL no define min() sobre uuid. El HAVING de
  -- abajo garantiza que el grupo tiene exactamente una fila, así que cualquier elemento es EL
  -- elemento.
  SELECT a.id AS advertiser_id, (array_agg(b.id))[1] AS account_id
  FROM ad_advertiser_accounts a
  JOIN atlas_sales.b2b_accounts b
    ON btrim(b.tax_id) = btrim(a.tax_id)
   AND upper(b.country_code) = upper(a.country_code)
  WHERE a.merchant_account_id IS NULL
    AND a.tax_id IS NOT NULL
    AND b.tax_id IS NOT NULL
  GROUP BY a.id
  HAVING count(*) = 1
) AS link
WHERE adv.id = link.advertiser_id
  AND adv.merchant_account_id IS NULL;

-- Índices de apoyo para el enlace por identidad del usuario anunciante.
CREATE INDEX IF NOT EXISTS idx_ad_advertiser_users_user
  ON ad_advertiser_users(user_id, status)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ad_advertiser_users_email
  ON ad_advertiser_users(lower(btrim(email)), status);

-- =====================================================================================
-- 3. Consistencia de planes del comercio
-- =====================================================================================
ALTER TABLE atlas_sales.merchant_plans
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  ALTER TABLE atlas_sales.merchant_plans
    ADD CONSTRAINT ck_merchant_plans_status
    CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE atlas_sales.merchant_plans
    ADD CONSTRAINT ck_merchant_plans_tier
    CHECK (tier IN ('STARTER', 'STANDARD', 'PREMIUM', 'ENTERPRISE')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE atlas_sales.merchant_plans
    ADD CONSTRAINT ck_merchant_plans_price CHECK (monthly_price >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE atlas_sales.merchant_plans
    ADD CONSTRAINT ck_merchant_plans_currency CHECK (currency ~ '^[A-Z]{3}$') NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================================================
-- 4. Consistencia de suscripciones del comercio
-- =====================================================================================
ALTER TABLE atlas_sales.merchant_subscriptions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_by_user_id uuid;

-- Normaliza el histórico ANTES de declarar las restricciones.
UPDATE atlas_sales.merchant_subscriptions
SET ended_at = COALESCE(ended_at, created_at)
WHERE status <> 'ACTIVE' AND ended_at IS NULL;

UPDATE atlas_sales.merchant_subscriptions
SET ended_at = NULL
WHERE status = 'ACTIVE' AND ended_at IS NOT NULL;

-- Doble suscripción activa: estado imposible que el modelo permitía. El servicio ya serializa
-- con lock sobre la cuenta, pero el histórico puede traerlo y sin saneo el índice único de más
-- abajo no se podría crear. Se conserva la más reciente y se cierran las anteriores.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY merchant_account_id
           ORDER BY started_at DESC NULLS LAST, created_at DESC
         ) AS position
  FROM atlas_sales.merchant_subscriptions
  WHERE status = 'ACTIVE'
)
UPDATE atlas_sales.merchant_subscriptions AS s
SET status = 'REPLACED', ended_at = now()
FROM ranked
WHERE ranked.id = s.id AND ranked.position > 1;

-- `REPLACED` ya se escribía desde el servicio sin estar declarado en ninguna restricción.
DO $$ BEGIN
  ALTER TABLE atlas_sales.merchant_subscriptions
    ADD CONSTRAINT ck_merchant_subscriptions_status
    CHECK (status IN ('ACTIVE', 'REPLACED', 'CANCELLED', 'EXPIRED')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Una suscripción cerrada debe tener fecha de cierre; una activa no puede tenerla.
DO $$ BEGIN
  ALTER TABLE atlas_sales.merchant_subscriptions
    ADD CONSTRAINT ck_merchant_subscriptions_ended_at
    CHECK (
      (status = 'ACTIVE' AND ended_at IS NULL)
      OR (status <> 'ACTIVE' AND ended_at IS NOT NULL)
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE atlas_sales.merchant_subscriptions
    ADD CONSTRAINT ck_merchant_subscriptions_period
    CHECK (current_period_end IS NULL OR current_period_end > started_at) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_merchant_subscriptions_account_status
  ON atlas_sales.merchant_subscriptions(merchant_account_id, status, started_at DESC);

-- Invariante estructural: a lo sumo una suscripción activa por comercio. Es la garantía que el
-- lock de aplicación no puede dar por sí solo (otro proceso, un script o una carga manual
-- escribirían igual), y la que sostiene el `findOne({ status: 'ACTIVE' })` del servicio.
CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_subscriptions_active_account
  ON atlas_sales.merchant_subscriptions(merchant_account_id)
  WHERE status = 'ACTIVE';

-- =====================================================================================
-- 5. Índices de apoyo para el panel de facturación del comercio
-- =====================================================================================
CREATE INDEX IF NOT EXISTS idx_merchant_invoices_account_date
  ON atlas_sales.merchant_invoices(account_id, invoice_date DESC);

CREATE INDEX IF NOT EXISTS idx_merchant_receivables_account_issued
  ON atlas_sales.merchant_receivables(account_id, issued_at DESC);
