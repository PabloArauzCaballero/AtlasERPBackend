-- Reversa de 20261008120000-sucursal-bnpl-bloqueada-por-atlas.sql
--
-- NO destruye la decisión de Atlas: si alguna sucursal está marcada como apagada por Atlas, la reversa
-- se NIEGA y no toca nada (quitar la columna borraría esa excepción y la regla volvería a encender la
-- sucursal). Sólo sirve en una base descartable o mientras ninguna sucursal esté bloqueada.
--
-- Idempotente: si la columna ya no existe no hay nada que comprobar. La consulta va como SQL dinámico
-- porque PostgreSQL resuelve los nombres de columna al ANALIZAR la sentencia, aunque el IF no se cumpla.

DO $$
DECLARE
  bloqueadas integer := 0;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'atlas_sales' AND table_name = 'merchant_branches'
      AND column_name = 'bnpl_blocked_by_atlas'
  ) THEN
    EXECUTE 'SELECT count(*) FROM atlas_sales.merchant_branches WHERE bnpl_blocked_by_atlas'
      INTO bloqueadas;
  END IF;

  IF bloqueadas > 0 THEN
    RAISE EXCEPTION 'Hay % sucursal(es) apagada(s) por Atlas: la reversa borraría esa decisión. Reviértelas antes.', bloqueadas;
  END IF;
END $$;

ALTER TABLE atlas_sales.merchant_branches DROP COLUMN IF EXISTS bnpl_blocked_by_atlas;
