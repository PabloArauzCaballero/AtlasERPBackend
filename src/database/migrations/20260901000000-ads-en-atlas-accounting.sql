-- Fija en qué schema viven las tablas de ATLAS Ads, en vez de dejarlo al azar del `search_path`.
--
-- `20260708203000-create-atlas-ads-schema.sql` crea sus 23 tablas con `CREATE TABLE ad_x (...)`,
-- sin cualificar el schema. Es el ÚNICO archivo de migración del ERP que lo hace: todos los demás
-- o escriben `atlas_sales.x` / `atlas_audit.x` explícitamente, o fijan su propio `search_path`.
-- Y como `run-sql` ejecutaba todos los archivos sobre la MISMA conexión sin restablecerlo, el
-- `SET search_path TO atlas_accounting` de los archivos de contabilidad —que corren justo antes—
-- se filtraba hasta aquí y decidía por ellas.
--
-- La consecuencia era que el mismo repositorio producía dos bases distintas según cómo se hubieran
-- agrupado las migraciones en procesos: `npm run db:migrate:prod` (un solo proceso, que es lo que
-- usan el compose y producción) las dejaba en `atlas_accounting`, y `npm run db:migrate` (un
-- proceso por dominio) las dejaba en `public`. Nadie lo veía porque cada instalación era coherente
-- consigo misma; se destapó al traer las semillas publicadas a una base creada por la otra ruta.
--
-- `atlas_accounting` es la ubicación real de toda instalación desplegada, así que es la que se fija.
-- Es idempotente y no toca datos: en una base que ya las tenga ahí no hace nada.
DO $$
DECLARE
  r record;
  movidas int := 0;
BEGIN
  IF to_regnamespace('atlas_accounting') IS NULL THEN
    RAISE EXCEPTION 'atlas_accounting no existe todavia: ejecuta antes las migraciones de contabilidad';
  END IF;

  FOR r IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'ad\_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I SET SCHEMA atlas_accounting', r.tablename);
    movidas := movidas + 1;
  END LOOP;

  -- Las secuencias PROPIAS de una columna viajan con su tabla; sólo hay que mover las sueltas.
  FOR r IN
    SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' AND sequencename LIKE 'ad\_%'
  LOOP
    EXECUTE format('ALTER SEQUENCE public.%I SET SCHEMA atlas_accounting', r.sequencename);
  END LOOP;

  RAISE NOTICE 'ATLAS Ads: % tablas reubicadas en atlas_accounting.', movidas;
END$$;
