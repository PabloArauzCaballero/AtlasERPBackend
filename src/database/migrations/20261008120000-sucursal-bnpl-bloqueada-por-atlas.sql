-- =====================================================================================
-- Sucursal: «apagada por Atlas» — la excepción explícita a «comercio aprobado = todas venden»
-- =====================================================================================
--
-- Pablo (2026-10-08): «corrígelo a largo plazo para que nunca más vuelva a suceder algo así».
-- En TEST, 8 sucursales ACTIVE de un comercio quedaron para siempre en «Por habilitar»: la capacidad de
-- vender a crédito (`can_originate_bnpl`) se escribía por cinco puertas distintas, cada una con su
-- criterio, y ninguna miraba si el comercio ya estaba aprobado.
--
-- La política que se fija: si la cuenta del comercio está aprobada (CUSTOMER), toda sucursal ACTIVE
-- vende a crédito sola —nueva, activada o reactivada—. Para que Atlas pueda apagar UNA a mano sin que
-- la regla la vuelva a encender, hace falta distinguir «apagada por Atlas» de «apagada porque nadie la
-- ha habilitado». Esta columna es esa marca. `can_originate_bnpl` sigue siendo lo que lee quien origina
-- la venta; la marca sólo decide si la regla puede tocarlo.
--
--   - NOT NULL DEFAULT false: nadie queda bloqueado por haber migrado; PG ≥ 11 lo añade sin reescribir.
--   - Sin backfill: no se inventa quién apagó qué. Las filas existentes quedan «no bloqueadas».
--
-- Idempotente.

ALTER TABLE atlas_sales.merchant_branches
  ADD COLUMN IF NOT EXISTS bnpl_blocked_by_atlas boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN atlas_sales.merchant_branches.bnpl_blocked_by_atlas IS
  'true = Atlas apagó a mano la venta a crédito de esta sucursal: la regla «comercio aprobado = todas venden» no la reenciende.';
