process.env.NODE_ENV ??= 'test';
// Se anota ANTES de poner el valor por defecto si la base la dio quien lanza las pruebas: las
// pruebas que necesitan PostgreSQL real (`describeWithDatabase`) no pueden fiarse de un defecto.
process.env.ATLAS_TEST_DATABASE_PROVIDED ??= process.env.DATABASE_URL ? 'true' : 'false';
process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5432/atlas_test';
process.env.JWT_ACCESS_SECRET ??= 'test_secret_with_more_than_32_characters';
process.env.CORS_ALLOWED_ORIGINS ??= 'http://localhost:5273';
process.env.LOG_LEVEL ??= 'silent';
process.env.AUTH_DISABLED_FOR_LOCAL_TESTING ??= 'false';
// Las pruebas nunca migran ni siembran al construir la app: la base de las e2e con PostgreSQL la
// prepara `yarn db:migrate:prod` (CI, job `db-integration`), igual que el job `migrate` del despliegue.
process.env.STARTUP_MIGRATIONS_ENABLED ??= 'false';
process.env.STARTUP_SEEDS_ENABLED ??= 'false';
