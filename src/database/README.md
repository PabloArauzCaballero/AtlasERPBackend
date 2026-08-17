# Base de datos

Configura Sequelize y registra los modelos del módulo. La aplicación no usa `sync({ force: true })` ni `sync({ alter: true })`; los cambios estructurales se aplican con migraciones SQL versionadas.

En el arranque, `DatabaseSeederService` aplica de forma idempotente las migraciones pendientes (lista canónica en `startup-migrations.ts`, tabla de control `public.atlas_sql_migrations` compartida con `scripts/db/run-sql.ts`) y luego los seeds de referencia. Se desactiva con `STARTUP_MIGRATIONS_ENABLED=false` / `STARTUP_SEEDS_ENABLED=false`.
