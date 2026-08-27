-- Lo que Atlas le cobra al comercio deja de ser una cadena de texto y pasa a ser un PRODUCTO.
--
-- Hasta aqui, la factura que le llegaba al partner decia «Cargo MDR» y la del modulo de publicidad
-- decia «Consumo publicitario <fecha> a <fecha>» con `pricing_model = 'ADJUSTMENT'` en todas las
-- lineas. Ninguno de los dos textos existia en ninguna parte como cosa vendible: no tenian codigo,
-- ni unidad de cobro, ni cuenta de ingreso, asi que no habia forma de decir cuanto factura Atlas
-- por alcance y cuanto por clics sin leer el enum de origen de cada cargo. Eso es lo que arregla
-- esta tabla.
--
-- El enlace con lo ya existente es `source_type`: los cargos (`merchant_receivables.source_type`)
-- y las lineas de factura ya lo traen, asi que el catalogo se ata a ellos por ese valor y el
-- historico queda clasificado sin migrar datos a mano. `product_id` es la referencia explicita
-- desde que existe el catalogo; `source_type` es lo que permite reconstruir lo de antes.
--
-- La TARIFA no vive aqui. El precio unitario de alcance y de clics es de cada plan comercial
-- (`merchant_plans.cpm_micros` / `cpc_micros`), porque es lo que se negocia con cada comercio; el
-- producto es la cosa vendida —su identidad, su unidad y su cuenta de ingreso—, que es la misma
-- para todos.

CREATE TABLE IF NOT EXISTS atlas_sales.billing_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(40) NOT NULL UNIQUE,
  name varchar(140) NOT NULL,
  description text,
  -- Como se mide lo que se cobra. Decide de que columna del plan sale el precio unitario:
  -- CPM -> cpm_micros, CPC -> cpc_micros; MDR y FIXED no toman precio del plan.
  charge_basis varchar(20) NOT NULL,
  -- Clave de enlace con los cargos y las lineas de factura que ya existen.
  source_type varchar(80) NOT NULL UNIQUE,
  unit_label varchar(80) NOT NULL,
  -- Numero de cuenta del plan contable (`atlas_accounting.gl_account.account_no`). Se guarda el
  -- numero y no el uuid porque la cuenta es por entidad legal y el catalogo es de la plataforma.
  revenue_gl_account_code varchar(40),
  currency char(3) NOT NULL DEFAULT 'BOB',
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_billing_products_charge_basis CHECK (charge_basis IN ('CPM', 'CPC', 'MDR', 'FIXED')),
  CONSTRAINT ck_billing_products_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  CONSTRAINT ck_billing_products_currency CHECK (currency ~ '^[A-Z]{3}$')
);

COMMENT ON TABLE atlas_sales.billing_products IS
  'Catalogo de lo que Atlas le factura al comercio. La tarifa unitaria vive en merchant_plans.';

-- Un solo producto activo por forma de cobro medida: el motor de entrega resuelve el producto a
-- partir del modelo de compra del conjunto de anuncios (CPM/CPC) y dos activos lo dejarian ambiguo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_products_active_metered_basis
  ON atlas_sales.billing_products(charge_basis)
  WHERE status = 'ACTIVE' AND charge_basis IN ('CPM', 'CPC');

ALTER TABLE atlas_sales.merchant_receivables
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES atlas_sales.billing_products(id);
ALTER TABLE atlas_sales.merchant_invoice_lines
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES atlas_sales.billing_products(id);

CREATE INDEX IF NOT EXISTS idx_merchant_receivables_product
  ON atlas_sales.merchant_receivables(product_id);
CREATE INDEX IF NOT EXISTS idx_merchant_invoice_lines_product
  ON atlas_sales.merchant_invoice_lines(product_id);

-- El cierre de periodo publicitario traslada el consumo a la cuenta corriente del comercio; se
-- ejecuta a mano y puede repetirse. No hace falta un indice nuevo para que el segundo intento
-- choque en vez de duplicar el cargo: `uq_merchant_receivable_source` —(source_type, source_id)
-- con source_id no nulo, de la migracion fundacional del CRM— ya lo impide, y el `source_id` de
-- estos cargos es la factura publicitaria del periodo.
