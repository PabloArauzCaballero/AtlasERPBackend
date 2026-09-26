/**
 * Pruebas de integración contra PostgreSQL REAL y migrado (`*.integration.spec.ts`).
 *
 * Van aparte de `jest.config.cjs` porque necesitan una base con el esquema aplicado por los
 * migradores del repositorio (`yarn db:migrate:prod`), y la suite unitaria corre sin ella. Sin
 * `DATABASE_URL` se SALTAN de forma visible en local; en CI (`CI=true`) o con
 * `REQUIRE_INTEGRATION_DB=true` la falta de base es un FALLO, no un salto: ver
 * `test/integration/database.ts`.
 *
 * Uso: `DATABASE_URL=postgres://... yarn test:integration`
 */
/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/integration/set-env.ts'],
  testRegex: '.*\\.integration\\.spec\\.ts$',
  maxWorkers: 1,
  testTimeout: 60000,
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
};
