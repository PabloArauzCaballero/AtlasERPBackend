/**
 * Sella una corrida para el evaluador de cumplimiento (P-02): SHA, comando, entorno y fecha.
 *
 * Jest no guarda en su JSON a qué commit pertenece, así que sin sello un resultado viejo o de otra
 * rama podría pasar por evidencia del candidato. El sello incluye el sha256 del archivo de
 * resultados: si alguien lo edita después, el evaluador lo rechaza.
 *
 * Uso:
 *   tsx scripts/compliance/stamp.ts jest <resultados.json> --command "<cmd>" --environment <env>
 *     → escribe <resultados.json>.evidence.json junto al archivo
 *   tsx scripts/compliance/stamp.ts command <nombre> --exit-code <n> --command "<cmd>"
 *       --environment <env> --out <dir>
 *     → escribe <dir>/<nombre>.command.evidence.json (nombre saneado)
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { candidateSha, sha256File } from './evaluate';
import type { EvidenceStamp } from './evaluator';

function option(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function main(): void {
  const [kind, target, ...rest] = process.argv.slice(2);
  const command = option(rest, '--command') ?? '';
  const environment = option(rest, '--environment') ?? (process.env.CI ? 'ci' : 'local');
  const sha = candidateSha(option(rest, '--sha') ?? null, process.cwd());
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  const artifact =
    GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID
      ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
      : null;

  if (kind === 'jest' && target) {
    if (!existsSync(target)) {
      // Sin archivo no hay evidencia: no se inventa un sello vacío.
      throw new Error(`No existe el resultado de Jest ${target}: la corrida no produjo evidencia.`);
    }
    const stamp: EvidenceStamp = {
      kind: 'jest',
      sha,
      command,
      environment,
      finishedAt: new Date().toISOString(),
      artifact,
      resultsFile: basename(target),
      resultsSha256: sha256File(target),
    };
    writeFileSync(`${target}.evidence.json`, `${JSON.stringify(stamp, null, 2)}\n`);
    return;
  }

  if (kind === 'command' && target) {
    const exitCode = Number(option(rest, '--exit-code'));
    if (!Number.isInteger(exitCode)) throw new Error('--exit-code debe ser un entero');
    const out = option(rest, '--out') ?? 'compliance-results';
    mkdirSync(out, { recursive: true });
    const stamp: EvidenceStamp = {
      kind: 'command',
      sha,
      command,
      environment,
      finishedAt: new Date().toISOString(),
      artifact,
      name: target,
      exitCode,
    };
    const file = join(out, `${target.replace(/[^A-Za-z0-9_.-]/g, '_')}.command.evidence.json`);
    writeFileSync(file, `${JSON.stringify(stamp, null, 2)}\n`);
    return;
  }

  throw new Error(
    'Uso: stamp.ts jest <resultados.json> … | stamp.ts command <nombre> --exit-code <n> …',
  );
}

if (require.main === module) main();
