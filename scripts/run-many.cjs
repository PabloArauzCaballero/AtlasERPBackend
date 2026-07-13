const { spawnSync } = require('node:child_process');

const scripts = process.argv.slice(2);

if (scripts.length === 0) {
  console.error('Uso: node scripts/run-many.cjs <script> [script2...]');
  process.exit(1);
}

const npmExecPath = process.env.npm_execpath;

if (!npmExecPath) {
  console.error('No se pudo detectar el gestor de paquetes desde npm_execpath.');
  process.exit(1);
}

for (const script of scripts) {
  const result = spawnSync(process.execPath, [npmExecPath, 'run', script], {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
