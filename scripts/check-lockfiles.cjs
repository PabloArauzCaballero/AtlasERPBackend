#!/usr/bin/env node
/**
 * Comprueba que `package-lock.json` declara lo mismo que `package.json`.
 *
 * Por qué existe: este repositorio tiene DOS lockfiles. Quien desarrolla usa yarn —lo exige la
 * regla del monorepo, porque `npm install` reescribe `yarn.lock` en su formato— pero la IMAGEN
 * se construye con `npm ci --omit=dev`. Así que un `yarn add` deja `yarn.lock` al día y
 * `package-lock.json` desfasado, y `npm ci` se niega a instalar con EUSAGE.
 *
 * Eso no lo ve nadie hasta el despliegue: CI instala con yarn y compila con tsc, nunca construye
 * la imagen. Medido el 2026-09-19: CI en verde y el despliegue muerto en 53 segundos con
 * «Missing: @opentelemetry/... from lock file». Esta comprobación mueve ese fallo de la
 * ventana de despliegue a la de desarrollo, que es donde cuesta un minuto arreglarlo.
 *
 * Es OFFLINE a propósito: compara los rangos declarados, no resuelve el árbol. No sustituye a
 * `npm ci`, sólo caza la divergencia que de verdad ocurre — añadir o quitar una dependencia con
 * el gestor «equivocado».
 *
 * Cuando falle: regenera el lockfile de npm EN UN WORKTREE y copia de vuelta sólo
 * `package-lock.json`, porque `npm install` también toca `yarn.lock`:
 *
 *   git worktree add --detach /tmp/lock HEAD && cd /tmp/lock
 *   npm install --package-lock-only --ignore-scripts
 *   git restore --source=HEAD -- yarn.lock
 *   cp package-lock.json <repo>/package-lock.json
 */
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');

const raiz = resolve(__dirname, '..');
const leer = (nombre) => JSON.parse(readFileSync(resolve(raiz, nombre), 'utf8'));

if (!existsSync(resolve(raiz, 'package-lock.json'))) {
  console.log('ℹ️  No hay package-lock.json: nada que comparar.');
  process.exit(0);
}

const pkg = leer('package.json');
const lock = leer('package-lock.json');
const raizDelLock = lock.packages?.[''] ?? {};

const problemas = [];
for (const bloque of ['dependencies', 'devDependencies', 'optionalDependencies']) {
  const declaradas = pkg[bloque] ?? {};
  const enLock = raizDelLock[bloque] ?? {};
  for (const [nombre, rango] of Object.entries(declaradas)) {
    if (!(nombre in enLock)) problemas.push(`falta en el lock: ${nombre}@${rango} (${bloque})`);
    else if (enLock[nombre] !== rango)
      problemas.push(
        `rango distinto: ${nombre} → package.json «${rango}», lock «${enLock[nombre]}»`,
      );
  }
  for (const nombre of Object.keys(enLock)) {
    if (!(nombre in declaradas)) problemas.push(`sobra en el lock: ${nombre} (${bloque})`);
  }
}

if (problemas.length > 0) {
  console.error(
    '❌ package-lock.json no coincide con package.json. `npm ci` fallará al construir la imagen:\n',
  );
  for (const p of problemas) console.error(`   - ${p}`);
  console.error('\n   Cómo arreglarlo: ver la cabecera de scripts/check-lockfiles.cjs.');
  process.exit(1);
}

const total =
  Object.keys(raizDelLock.dependencies ?? {}).length +
  Object.keys(raizDelLock.devDependencies ?? {}).length;
console.log(`✅ package-lock.json coincide con package.json (${total} dependencias directas).`);
