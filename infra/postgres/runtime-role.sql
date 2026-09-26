-- =============================================================================================
-- P-13 · Rol de base de datos de RUNTIME para la API del ERP (propuesta, lo ejecuta el DBA).
--
-- Hoy la API y el job `migrate` comparten `DATABASE_URL` (docker-compose.yml, compose de Coolify)
-- y la API arranca con `STARTUP_MIGRATIONS_ENABLED=true` y `STARTUP_SEEDS_ENABLED=true` por
-- omisión: el proceso que atiende peticiones es DUEÑO del esquema y puede CREATE/ALTER/DROP,
-- TRUNCATE y `ALTER TABLE ... DISABLE TRIGGER` —lo que desactiva los disparadores append-only que
-- protegen los hechos contables—. Una inyección o un error en runtime tendría ese alcance.
--
-- Este guion crea el grupo `atlas_erp_runtime` con sólo DML sobre los esquemas del ERP, y deja
-- privilegios por defecto para que las tablas que creen migraciones FUTURAS (ejecutadas por el
-- mismo rol dueño que corre este guion) también le lleguen. Es idempotente.
--
-- Uso (como el rol DUEÑO/migrador, el mismo que ejecuta `db:migrate:prod`):
--   psql "$MIGRATOR_DATABASE_URL" -f infra/postgres/runtime-role.sql
--   psql "$MIGRATOR_DATABASE_URL" -c "CREATE ROLE atlas_erp_app LOGIN PASSWORD '<secreto>' IN ROLE atlas_erp_runtime"
-- Y en el servicio `api`: DATABASE_URL con `atlas_erp_app`, STARTUP_MIGRATIONS_ENABLED=false y
-- STARTUP_SEEDS_ENABLED=false (migrar y sembrar quedan sólo en el job `migrate`, con el dueño).
--
-- Prueba: test/authz-db-runtime-role.integration.spec.ts (DML sí, DDL no, y la API arranca y
-- responde con este rol).
-- =============================================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_erp_runtime') THEN
    CREATE ROLE atlas_erp_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END $$;

DO $$
DECLARE
  schema_name text;
BEGIN
  FOREACH schema_name IN ARRAY ARRAY['atlas_sales', 'atlas_accounting', 'atlas_audit', 'atlas_ads', 'public']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = schema_name) THEN
      -- USAGE sí, CREATE no: el runtime no crea objetos.
      EXECUTE format('REVOKE CREATE ON SCHEMA %I FROM atlas_erp_runtime', schema_name);
      EXECUTE format('GRANT USAGE ON SCHEMA %I TO atlas_erp_runtime', schema_name);
      -- DML, sin TRUNCATE, REFERENCES ni TRIGGER.
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO atlas_erp_runtime',
        schema_name);
      EXECUTE format(
        'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA %I TO atlas_erp_runtime',
        schema_name);
      EXECUTE format(
        'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA %I TO atlas_erp_runtime', schema_name);
      -- Lo que creen las migraciones futuras del rol que ejecuta este guion.
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO atlas_erp_runtime',
        schema_name);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO atlas_erp_runtime',
        schema_name);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT EXECUTE ON FUNCTIONS TO atlas_erp_runtime',
        schema_name);
    END IF;
  END LOOP;
END $$;

-- El registro de migraciones es del job `migrate`: el runtime ni lo lee ni lo escribe.
DO $$
BEGIN
  IF to_regclass('public.atlas_sql_migrations') IS NOT NULL THEN
    REVOKE ALL ON public.atlas_sql_migrations FROM atlas_erp_runtime;
  END IF;
END $$;
