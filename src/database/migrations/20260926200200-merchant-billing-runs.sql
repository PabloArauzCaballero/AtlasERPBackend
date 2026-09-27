-- =====================================================================================
-- Facturación periódica automática de comercios (plan de facturación SIAT, F6) — 2026-09-26
-- =====================================================================================
-- Hasta hoy `b2b_contracts.billing_cycle` sólo se guardaba: nada agrupaba los cargos CxC en
-- facturas. Esta tabla registra cada CORRIDA de cierre, una por clave de ciclo (`MONTHLY:2026-10`):
-- la unicidad de la clave es lo que impide que dos instancias de la API facturen el mismo ciclo
-- dos veces durante un despliegue. Sólo AÑADE una tabla. Idempotente.

CREATE TABLE IF NOT EXISTS atlas_sales.merchant_billing_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_key varchar(40) NOT NULL,
  invoice_date date NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'RUNNING',
  trigger varchar(20) NOT NULL DEFAULT 'SCHEDULE',
  requested_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  accounts_considered integer NOT NULL DEFAULT 0,
  invoices_created integer NOT NULL DEFAULT 0,
  invoices jsonb NOT NULL DEFAULT '[]'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT uq_merchant_billing_runs_cycle UNIQUE (cycle_key),
  CONSTRAINT ck_merchant_billing_runs_status CHECK (status IN ('RUNNING', 'DONE', 'PARTIAL', 'FAILED')),
  CONSTRAINT ck_merchant_billing_runs_trigger CHECK (trigger IN ('SCHEDULE', 'MANUAL'))
);

COMMENT ON TABLE atlas_sales.merchant_billing_runs IS
  'Corridas del cierre de facturación de comercios. Una por ciclo (cycle_key única): la segunda instancia no factura dos veces.';
