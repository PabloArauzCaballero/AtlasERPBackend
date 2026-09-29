#!/usr/bin/env node
/**
 * Toda variable que el esquema de entorno (`src/config/env.ts`) declara tiene que estar NOMBRADA en
 * `.env.example` (P2-4, auditoría 2026-09-29; mismo gate que AtlasDashboardsBackend y AtlasBackend).
 *
 * Una variable que el código lee y la plantilla no nombra es una que nadie configura en el
 * despliegue siguiente y cuyo valor por defecto decide en silencio: faltaban, entre otras,
 * ATLAS_IDENTITY_BASE_URL (el login interno moría dentro de un contenedor) y
 * PLATFORM_CATALOG_API_KEY (el portal mostraba el ERP «no configurado»).
 *
 * Cuenta como nombrada comentada o no: una credencial no lleva valor en la plantilla, pero sí tiene
 * que aparecer con su explicación. Sin dependencias: corre antes de instalar nada.
 *
 * Uso: node scripts/check-env-example.cjs [--schema <env.ts>] [--template <.env.example>]
 */
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

/** Claves de primer nivel del objeto zod: cuatro espacios, NOMBRE, dos puntos y `z`. */
function declaredKeys(schema) {
  return [...new Set([...schema.matchAll(/^ {4}([A-Z][A-Z0-9_]{2,}):\s*z\b/gm)].map((m) => m[1]))];
}

function namedKeys(template) {
  return new Set([...template.matchAll(/^#?\s*([A-Z][A-Z0-9_]{2,})=/gm)].map((m) => m[1]));
}

function missingKeys(schema, template) {
  const named = namedKeys(template);
  return declaredKeys(schema)
    .filter((key) => !named.has(key))
    .sort();
}

function main(argv) {
  const root = join(__dirname, '..');
  const arg = (name, fallback) => {
    const index = argv.indexOf(name);
    return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
  };
  const schema = readFileSync(arg('--schema', join(root, 'src/config/env.ts')), 'utf8');
  const template = readFileSync(arg('--template', join(root, '.env.example')), 'utf8');
  const declared = declaredKeys(schema);
  if (declared.length === 0) {
    console.error(
      '❌ No se encontró ninguna variable en el esquema: el patrón ya no casa con env.ts.',
    );
    return 1;
  }
  const missing = missingKeys(schema, template);
  if (missing.length) {
    console.error(
      `❌ ${missing.length} variable(s) del esquema no aparecen en .env.example:\n  - ${missing.join('\n  - ')}`,
    );
    console.error('\nAñádelas con una nota que diga qué pasa si se dejan vacías.');
    return 1;
  }
  console.log(`✅ .env.example nombra las ${declared.length} variables del esquema.`);
  return 0;
}

module.exports = { declaredKeys, missingKeys };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
