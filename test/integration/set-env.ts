/*
 * Entorno de las pruebas de integración. A diferencia de `test/set-env.ts`, NO inventa un
 * `DATABASE_URL`: una prueba de integración sin base real no prueba nada, y un valor por defecto
 * haría que se conectara a lo que hubiera en `localhost:5432`. Lo demás sí lleva defecto, porque
 * `src/config/env.ts` lo valida al importarse.
 */
// Mismo contrato que `test/set-env.ts`: otras suites de integración deciden con esta marca si la
// base la dio quien lanza las pruebas. En CI el job la fija a 'true' junto a REQUIRE_INTEGRATION_DB.
process.env.ATLAS_TEST_DATABASE_PROVIDED ??= process.env.DATABASE_URL ? 'true' : 'false';
process.env.NODE_ENV ??= 'test';
process.env.JWT_ACCESS_SECRET ??= 'test_secret_with_more_than_32_characters';
process.env.CORS_ALLOWED_ORIGINS ??= 'http://localhost:5273';
process.env.LOG_LEVEL ??= 'silent';
process.env.AUTH_DISABLED_FOR_LOCAL_TESTING = 'false';
process.env.DB_SSL ??= 'false';
// La base ya viene migrada por `yarn db:migrate:prod`: la app no debe migrar ni sembrar al arrancar.
process.env.STARTUP_MIGRATIONS_ENABLED = 'false';
process.env.STARTUP_SEEDS_ENABLED = 'false';
