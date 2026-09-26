/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/set-env.ts'],
  testRegex: '.*\\.spec\\.ts$',
  // Las de integración necesitan PostgreSQL migrado y van por `yarn test:integration`
  // (jest.integration.config.cjs). Aquí se excluyen para que la suite unitaria no dependa de base.
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.spec\\.ts$'],
  maxWorkers: 1,
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/**/*.module.ts', '!src/**/*.d.ts'],
};
