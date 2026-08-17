-- ATLAS - Calificación de deuda y de clientes B2B (CRM / cuentas por cobrar)
--
-- Hasta aquí `atlas_sales` sabía QUÉ debe cada comercio (`merchant_receivables.amount_open`,
-- `due_date`) pero no lo CALIFICABA: no había días de mora derivados, ni categoría de riesgo, ni
-- previsión, ni una calificación del cliente que agregara todas sus cuentas por cobrar. La única
-- columna de riesgo existente, `b2b_accounts.risk_tier`, es texto libre que el llamador de la API
-- envía a mano: sin catálogo, sin cálculo y sin historial.
--
-- Decisiones de diseño:
--
-- 1. La escala vive en la base (`rating_policy_versions` + `rating_policy_bands`), no en el código.
--    Cambiar un umbral es insertar una versión y activarla, y una calificación emitida hace meses
--    sigue siendo reproducible porque guarda con qué versión se calculó.
--
-- 2. Las calificaciones son append-only con puntero al presente (`is_current`). Sobrescribir en
--    sitio haría imposible el reporte que pide finanzas en cada cierre: cuántas cuentas migraron de
--    categoría este mes y por cuánto dinero.
--
-- 3. `b2b_accounts.risk_tier` NO se toca. Se añade `risk_rating_grade` aparte, porque son dos cosas
--    distintas: el tier es el juicio comercial que carga un ejecutivo al dar de alta la cuenta, y el
--    grade es el resultado calculado sobre la mora real. Pisar uno con otro haría que nadie pudiera
--    decir cuál está viendo, y rompería a los consumidores que hoy escriben el tier a mano.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS atlas_sales.rating_policy_versions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_code           varchar(80)  NOT NULL,
  version_code          varchar(40)  NOT NULL,
  scale_code            varchar(40)  NOT NULL,
  status                varchar(20)  NOT NULL DEFAULT 'DRAFT',
  effective_from        timestamptz  NOT NULL DEFAULT now(),
  effective_until       timestamptz,
  contamination_enabled boolean      NOT NULL DEFAULT true,
  description           text,
  created_at            timestamptz  NOT NULL DEFAULT now(),
  updated_at            timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT ck_sales_rating_policy_status CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
  CONSTRAINT ck_sales_rating_policy_window CHECK (effective_until IS NULL OR effective_until > effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_rating_policy_code
  ON atlas_sales.rating_policy_versions (policy_code, version_code);

-- UNA sola política activa por código, impuesto en la base. Dos activas no dan un error visible:
-- dan calificaciones que dependen de cuál leyó primero la consulta, y para cuando se note la
-- cartera ya está calificada con dos matrices sin forma de saber cuál usó cada fila.
CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_rating_policy_active
  ON atlas_sales.rating_policy_versions (policy_code) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS atlas_sales.rating_policy_bands (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_version_id uuid          NOT NULL REFERENCES atlas_sales.rating_policy_versions(id) ON DELETE CASCADE,
  grade             varchar(4)    NOT NULL,
  grade_label       varchar(60)   NOT NULL,
  severity_rank     integer       NOT NULL,
  min_days_past_due integer       NOT NULL,
  max_days_past_due integer,
  provision_rate    numeric(6,4)  NOT NULL,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT ck_sales_rating_band_range CHECK (
    min_days_past_due >= 0
    AND (max_days_past_due IS NULL OR max_days_past_due >= min_days_past_due)
    AND severity_rank >= 0
  ),
  CONSTRAINT ck_sales_rating_band_provision CHECK (provision_rate >= 0 AND provision_rate <= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_rating_band_grade
  ON atlas_sales.rating_policy_bands (policy_version_id, grade);

-- El orden de severidad es único porque es lo que decide el arrastre: dos categorías empatadas
-- harían que «la peor» dependa del orden de lectura y el mismo cliente calificaría distinto en dos
-- consultas iguales.
CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_rating_band_rank
  ON atlas_sales.rating_policy_bands (policy_version_id, severity_rank);

CREATE TABLE IF NOT EXISTS atlas_sales.receivable_risk_ratings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id     uuid          NOT NULL REFERENCES atlas_sales.merchant_receivables(id) ON DELETE CASCADE,
  account_id        uuid          NOT NULL REFERENCES atlas_sales.b2b_accounts(id) ON DELETE CASCADE,
  policy_version_id uuid          NOT NULL REFERENCES atlas_sales.rating_policy_versions(id),
  grade             varchar(4)    NOT NULL,
  grade_label       varchar(60)   NOT NULL,
  severity_rank     integer       NOT NULL,
  days_past_due     integer       NOT NULL DEFAULT 0,
  receivable_status varchar(30)   NOT NULL,
  exposure_amount   numeric(18,2) NOT NULL DEFAULT 0,
  provision_rate    numeric(6,4)  NOT NULL DEFAULT 0,
  provision_amount  numeric(18,2) NOT NULL DEFAULT 0,
  previous_grade    varchar(4),
  rating_reason     varchar(40)   NOT NULL DEFAULT 'DAYS_PAST_DUE',
  is_current        boolean       NOT NULL DEFAULT true,
  rated_at          timestamptz   NOT NULL DEFAULT now(),
  created_at        timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT ck_sales_receivable_rating_amounts CHECK (
    days_past_due >= 0 AND exposure_amount >= 0 AND provision_amount >= 0
    AND provision_rate >= 0 AND provision_rate <= 1
  ),
  CONSTRAINT ck_sales_receivable_rating_reason CHECK (
    rating_reason IN ('DAYS_PAST_DUE','DISPUTED','MANUAL_OVERRIDE','POLICY_CHANGE')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_receivable_rating_current
  ON atlas_sales.receivable_risk_ratings (receivable_id) WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_sales_receivable_rating_history
  ON atlas_sales.receivable_risk_ratings (receivable_id, rated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_receivable_rating_account
  ON atlas_sales.receivable_risk_ratings (account_id) WHERE is_current = true;
-- La distribución de la cartera por categoría es la consulta de cierre: se resuelve por índice.
CREATE INDEX IF NOT EXISTS idx_sales_receivable_rating_grade
  ON atlas_sales.receivable_risk_ratings (grade) WHERE is_current = true;

CREATE TABLE IF NOT EXISTS atlas_sales.b2b_account_risk_ratings (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id             uuid          NOT NULL REFERENCES atlas_sales.b2b_accounts(id) ON DELETE CASCADE,
  policy_version_id      uuid          NOT NULL REFERENCES atlas_sales.rating_policy_versions(id),
  grade                  varchar(4)    NOT NULL,
  grade_label            varchar(60)   NOT NULL,
  severity_rank          integer       NOT NULL,
  worst_days_past_due    integer       NOT NULL DEFAULT 0,
  rated_receivable_count integer       NOT NULL DEFAULT 0,
  total_exposure_amount  numeric(18,2) NOT NULL DEFAULT 0,
  total_provision_amount numeric(18,2) NOT NULL DEFAULT 0,
  driving_receivable_id  uuid,
  previous_grade         varchar(4),
  rating_reason          varchar(40)   NOT NULL DEFAULT 'WORST_RECEIVABLE',
  is_current             boolean       NOT NULL DEFAULT true,
  rated_at               timestamptz   NOT NULL DEFAULT now(),
  created_at             timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT ck_sales_account_rating_amounts CHECK (
    worst_days_past_due >= 0 AND rated_receivable_count >= 0
    AND total_exposure_amount >= 0 AND total_provision_amount >= 0
  ),
  CONSTRAINT ck_sales_account_rating_reason CHECK (
    rating_reason IN ('WORST_RECEIVABLE','NO_OPEN_DEBT','MANUAL_OVERRIDE','POLICY_CHANGE')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_account_rating_current
  ON atlas_sales.b2b_account_risk_ratings (account_id) WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_sales_account_rating_history
  ON atlas_sales.b2b_account_risk_ratings (account_id, rated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_account_rating_grade
  ON atlas_sales.b2b_account_risk_ratings (grade) WHERE is_current = true;

-- La calificación calculada, junto a la cuenta, para que listar el CRM no exija un join por fila.
-- Es una proyección: la fuente de verdad sigue siendo `b2b_account_risk_ratings`.
ALTER TABLE atlas_sales.b2b_accounts
  ADD COLUMN IF NOT EXISTS risk_rating_grade varchar(4);
ALTER TABLE atlas_sales.b2b_accounts
  ADD COLUMN IF NOT EXISTS risk_rating_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_b2b_accounts_risk_rating_grade
  ON atlas_sales.b2b_accounts (risk_rating_grade) WHERE risk_rating_grade IS NOT NULL;

-- Los vencimientos abiertos son la población del barrido: sin este índice lo recorre entero.
CREATE INDEX IF NOT EXISTS idx_merchant_receivables_open
  ON atlas_sales.merchant_receivables (account_id, due_date)
  WHERE status NOT IN ('PAID','CANCELLED');
