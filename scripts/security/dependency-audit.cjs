/**
 * Auditoría de dependencias con Yarn Classic, sin tocar `yarn.lock` (P-12).
 *
 * `yarn audit` devuelve como código de salida una máscara de TODAS las severidades encontradas
 * (1 info, 2 low, 4 moderate, 8 high, 16 critical), aunque se le pase `--level high`: con él, un
 * único aviso moderado ya pone el paso en rojo, y sin él no hay gate. Por eso se lee el resumen JSON
 * y se decide aquí.
 *
 * Política (ver docs/compliance/decisions.md, P-12):
 *  - Dependencias de PRODUCCIÓN (las que lleva la imagen): high o critical ⇒ FALLA.
 *  - Todo el árbol (incluidas las de desarrollo): se informa y se guarda como artefacto; no bloquea
 *    todavía porque no llega a la imagen desplegada. Se endurece con AUDIT_FAIL_ON_DEV=true.
 *
 * Nunca usa npm: npm reescribiría el yarn.lock (regla 6 del CLAUDE.md de Atlas).
 * Uso: node scripts/security/dependency-audit.cjs [--out <dir>]
 */
const { spawnSync } = require('node:child_process');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const outIndex = process.argv.indexOf('--out');
const outDir = outIndex > 0 ? process.argv[outIndex + 1] : 'audit-results';
const failOnDev = process.env.AUDIT_FAIL_ON_DEV === 'true';

function audit(groups) {
  const args = ['audit', '--json', ...(groups ? ['--groups', groups] : [])];
  const result = spawnSync('yarn', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  const lines = result.stdout.split('\n').filter(Boolean);
  const advisories = [];
  let summary = null;
  for (const line of lines) {
    const entry = JSON.parse(line);
    if (entry.type === 'auditSummary') summary = entry.data;
    if (entry.type === 'auditAdvisory') {
      const a = entry.data.advisory;
      advisories.push({
        id: a.id,
        module: a.module_name,
        severity: a.severity,
        title: a.title,
        vulnerableVersions: a.vulnerable_versions,
        patchedVersions: a.patched_versions,
        path: entry.data.resolution && entry.data.resolution.path,
        url: a.url,
      });
    }
  }
  if (!summary) {
    throw new Error(`yarn audit no devolvió resumen (salida ${result.status}): ${result.stderr}`);
  }
  return { summary, advisories };
}

const production = audit('dependencies');
const all = audit(null);
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, 'dependency-audit.json'),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), production, all }, null, 2)}\n`,
);

const count = (v) => (v.high || 0) + (v.critical || 0);
const prodBlocking = count(production.summary.vulnerabilities);
const allBlocking = count(all.summary.vulnerabilities);
console.log(
  `Producción: ${JSON.stringify(production.summary.vulnerabilities)} · Todo el árbol: ${JSON.stringify(all.summary.vulnerabilities)}`,
);

if (prodBlocking > 0) {
  console.error(
    `❌ ${prodBlocking} vulnerabilidad(es) high/critical en dependencias de producción.`,
  );
  for (const a of production.advisories.filter((x) => ['high', 'critical'].includes(x.severity))) {
    console.error(`   ${a.severity} ${a.module} ${a.vulnerableVersions} — ${a.title} (${a.url})`);
  }
  process.exit(1);
}
if (allBlocking > 0) {
  const message = `${allBlocking} vulnerabilidad(es) high/critical sólo en dependencias de desarrollo (no van en la imagen).`;
  if (failOnDev) {
    console.error(`❌ ${message}`);
    process.exit(1);
  }
  console.log(`::warning::${message} Ver artefacto dependency-audit.json.`);
}
console.log('✅ Sin vulnerabilidades high/critical en dependencias de producción.');
