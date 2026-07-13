const { spawnSync } = require('child_process');

const commands = [
  ['TypeScript type-check', './node_modules/.bin/tsc --noEmit'],
  ['ESLint', './node_modules/.bin/eslint .'],
  ['Clean build state', 'node scripts/clean-build-state.cjs'],
  ['Build', './node_modules/.bin/tsc -p tsconfig.build.json --pretty false --diagnostics'],
  ['Use-case audit', 'node dist/scripts/audit/use-cases.js'],
  [
    'Format audit artifacts',
    './node_modules/.bin/prettier --write docs/audit/use-case-compliance-audit.json docs/audit/use-case-compliance-audit.md',
  ],
  ['Dependency audit', 'npm audit --omit=dev'],
  ['Unit tests', './node_modules/.bin/jest --config ./jest.config.cjs'],
  ['E2E tests', './node_modules/.bin/jest --config ./test/jest-e2e.json --runInBand --forceExit'],
];

function runCommand(commandLine) {
  if (process.platform === 'win32') {
    return spawnSync('cmd.exe', ['/d', '/s', '/c', commandLine], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    });
  }

  return spawnSync('bash', ['-lc', commandLine], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
}

for (const [label, commandLine] of commands) {
  process.stdout.write(`\n===== ${label} =====\n`);
  const result = runCommand(commandLine);

  if (result.error) {
    process.stderr.write(`\n${label} failed: ${result.error.message}\n`);
    process.exit(1);
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    process.stderr.write(`\n${label} failed with exit code ${result.status}.\n`);
    process.exit(result.status);
  }
}

process.stdout.write('\nDeployment check completed successfully.\n');
