-- El comercio paga por ALCANCE y por CLICS, no una cuota mensual con tope de sucursales.
--
-- Los planes nacieron como escalones de software: Bs 0 / 349 / 899 al mes, y lo que separaba uno de
-- otro era cuantas sucursales dejaba abrir —1, hasta 5, ilimitadas—. Ese modelo contradice al que
-- la plataforma tiene implementado de verdad: los conjuntos de anuncios ya se compran por `CPM` o
-- `CPC` (`ad_ad_sets.buying_model`), los espacios ya tienen precio suelo por millar, y el gasto ya
-- se acumula en la campana. La pantalla de planes vendia una cosa y el motor cobraba otra.
--
-- Dos consecuencias del cambio:
--
--  1. **Ningun plan limita sucursales.** Nunca lo hizo de verdad —era texto en `features`, sin una
--     sola comprobacion detras—, asi que el tope solo servia para prometer una restriccion que el
--     sistema no aplicaba. Un comercio con veinte locales no consume mas plataforma; consume mas
--     alcance, y eso ya se le cobra por alcance.
--
--  2. **El precio deja de ser mensual.** Lo que distingue a un plan de otro es la TARIFA: cuanto
--     cuesta llegar a mil personas y cuanto cuesta un clic. `monthly_price` se queda en cero y sin
--     uso; no se borra la columna para no romper lo que aun la lee.

ALTER TABLE atlas_sales.merchant_plans
  ADD COLUMN IF NOT EXISTS cpm_micros bigint NOT NULL DEFAULT 0;
ALTER TABLE atlas_sales.merchant_plans
  ADD COLUMN IF NOT EXISTS cpc_micros bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN atlas_sales.merchant_plans.cpm_micros IS
  'Precio por cada 1.000 personas alcanzadas, en micros de la moneda del plan.';
COMMENT ON COLUMN atlas_sales.merchant_plans.cpc_micros IS
  'Precio por clic, en micros de la moneda del plan.';

-- En micros, como el resto del bloque de Ads: en decimales, un CPM de Bs 2,50 repartido entre mil
-- impresiones se redondea a cero mil veces seguidas y la campana no gasta nunca.
ALTER TABLE atlas_sales.merchant_plans
  DROP CONSTRAINT IF EXISTS ck_merchant_plans_tarifas;
ALTER TABLE atlas_sales.merchant_plans
  ADD CONSTRAINT ck_merchant_plans_tarifas CHECK (cpm_micros >= 0 AND cpc_micros >= 0);

-- Las tarifas bajan con el compromiso de volumen, que es lo unico que de verdad separa a un
-- comercio grande de uno pequeno. El suelo (2,50 CPM / 1,50 CPC) es el mismo que ya declaran los
-- espacios publicitarios: por debajo, la plataforma vende por menos de lo que le cuesta entregar.
UPDATE atlas_sales.merchant_plans SET
  name        = 'Sin compromiso',
  tier        = 'STARTER',
  description = 'Pague solo por lo que entregue. Sin cuota mensual y sin permanencia.',
  monthly_price = 0,
  cpm_micros  = 4000000,
  cpc_micros  = 2500000,
  features    = '["Sucursales ilimitadas","Sin cuota mensual ni permanencia","Alcance y clics medidos por campana","Panel de consumo y facturacion"]'::jsonb
WHERE code = 'STARTER';

UPDATE atlas_sales.merchant_plans SET
  name        = 'Crecimiento',
  tier        = 'STANDARD',
  description = 'Tarifa mas baja a cambio de un compromiso mensual de inversion.',
  monthly_price = 0,
  cpm_micros  = 3200000,
  cpc_micros  = 1900000,
  features    = '["Sucursales ilimitadas","Segmentacion por zona e interes","Limite de frecuencia por persona","Soporte prioritario"]'::jsonb
WHERE code = 'GROWTH';

UPDATE atlas_sales.merchant_plans SET
  name        = 'Escala',
  tier        = 'PREMIUM',
  description = 'La tarifa mas baja disponible, para inversion publicitaria sostenida.',
  monthly_price = 0,
  cpm_micros  = 2500000,
  cpc_micros  = 1500000,
  features    = '["Sucursales ilimitadas","Segmentacion avanzada y publicos similares","Facturacion consolidada","Gerente de cuenta dedicado"]'::jsonb
WHERE code = 'SCALE';
