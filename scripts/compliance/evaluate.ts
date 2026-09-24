/**
 * CLI del evaluador de cumplimiento (P-02). Lee:
 *   - docs/compliance/requirements/*.json   requisitos por paquete (formato en REGLAS / decisions.md)
 *   - docs/compliance/release-scope.json    los 258 casos del catálogo contable y su alcance
 *   - <results-dir>/**\/*.evidence.json      sellos de corridas (ver `stamp.ts`) + resultados Jest
 * y escribe docs/compliance/evidence-index.json (o `--out`). Con `--write-audit` regenera también
 * docs/audit/use-case-compliance-audit.{json,md} desde el mismo resultado.
 *
 * Uso:
 *   tsx scripts/compliance/evaluate.ts [--results-dir compliance-results] [--out <archivo>]
 *                                      [--sha <sha>] [--write-audit] [--strict]
 *
 * `--strict` sale con código 1 si algún requisito o caso incluido no está VERIFIED, si queda alguna
 * decisión de alcance pendiente o si algún archivo de requisitos es inválido. Sin `--strict` sólo
 * falla (código 2) ante requisitos mal formados: el índice se publica igual.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import {
  evaluate,
  type EvaluationResult,
  type EvidenceSource,
  type EvidenceStamp,
  type RequirementInput,
  type UseCaseInput,
} from './evaluator';
import { renderAuditMarkdown, toAuditJson } from './audit-report';

interface Args {
  resultsDir: string | null;
  out: string;
  sha: string | null;
  strict: boolean;
  writeAudit: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    resultsDir: null,
    out: 'docs/compliance/evidence-index.json',
    sha: null,
    strict: false,
    writeAudit: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--results-dir') args.resultsDir = argv[++i] ?? null;
    else if (arg === '--out') args.out = argv[++i] ?? args.out;
    else if (arg === '--sha') args.sha = argv[++i] ?? null;
    else if (arg === '--strict') args.strict = true;
    else if (arg === '--write-audit') args.writeAudit = true;
    else throw new Error(`Argumento desconocido: ${arg}`);
  }
  return args;
}

export function candidateSha(explicit: string | null, root: string): string {
  if (explicit) return explicit;
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString('utf8').trim();
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function loadSources(resultsDir: string | null): EvidenceSource[] {
  if (!resultsDir) return [];
  return walk(resultsDir)
    .filter((path) => path.endsWith('.evidence.json'))
    .map((path) => {
      const stamp = JSON.parse(readFileSync(path, 'utf8')) as EvidenceStamp;
      const source: EvidenceSource = { stamp, location: path };
      if (stamp.kind === 'jest' && stamp.resultsFile) {
        const resultsPath = resolve(dirname(path), stamp.resultsFile);
        if (existsSync(resultsPath)) {
          source.actualSha256 = sha256File(resultsPath);
          source.jest = JSON.parse(readFileSync(resultsPath, 'utf8')) as EvidenceSource['jest'];
        }
      }
      return source;
    });
}

function loadRequirements(root: string): RequirementInput[] {
  const dir = join(root, 'docs/compliance/requirements');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .flatMap((file) => {
      const parsed = JSON.parse(readFileSync(join(dir, file), 'utf8')) as unknown;
      const list = Array.isArray(parsed) ? parsed : [parsed];
      return (list as RequirementInput[]).map((r) => ({
        ...r,
        sourceFile: `docs/compliance/requirements/${file}`,
      }));
    });
}

function loadScope(root: string): UseCaseInput[] {
  const path = join(root, 'docs/compliance/release-scope.json');
  if (!existsSync(path)) return [];
  return (JSON.parse(readFileSync(path, 'utf8')) as { useCases: UseCaseInput[] }).useCases;
}

function runUrl(): string | null {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  return GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID
    ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
    : null;
}

function printSummary(result: EvaluationResult): void {
  const line = (label: string, s: EvaluationResult['summary']['requirements']) =>
    `${label}: ${s.compliance} · total ${s.total} · pendientes de decisión ${s.pendingScopeDecision}` +
    ` · diferidos ${s.deferred} · ${Object.entries(s.byStatus)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}`;
  process.stdout.write(
    [
      `Candidato ${result.candidateSha}`,
      `Fuentes aceptadas: ${result.sources.filter((s) => s.accepted).length}/${result.sources.length}`,
      ...result.sources
        .filter((s) => !s.accepted)
        .map((s) => `  rechazada ${s.location}: ${s.reason}`),
      line('Requisitos', result.summary.requirements),
      line('Casos de uso', result.summary.useCases),
      ...result.invalid.map((e) => `INVÁLIDO ${e}`),
      `Estricto: ${result.summary.strictPass ? 'PASA' : 'NO PASA'}`,
      '',
    ].join('\n'),
  );
}

function main(): void {
  const root = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const sha = candidateSha(args.sha, root);
  const result = evaluate({
    candidateSha: sha,
    requirements: loadRequirements(root),
    useCases: loadScope(root),
    sources: loadSources(args.resultsDir),
    fileExists: (path) => existsSync(join(root, path)),
  });

  const index = {
    schemaVersion: 1,
    repository: 'AtlasERPBackend',
    generatedAt: new Date().toISOString(),
    environment: process.env.COMPLIANCE_ENVIRONMENT ?? (process.env.CI ? 'ci' : 'local'),
    runUrl: runUrl(),
    scope:
      'Requisitos de docs/compliance/requirements/*.json y los 258 casos de ' +
      'docs/compliance/release-scope.json. Denominador: sólo elementos incluidos en el release; ' +
      'los pendientes de decisión y los diferidos se listan aparte y no suman cumplimiento.',
    rules: [
      'VERIFIED sólo si todas las pruebas/comandos mapeados pasaron en candidateSha.',
      'Una clasificación documental (MODEL_SUPPORTED, etc.) nunca es evidencia.',
      'Prueba saltada, ausente o de otro SHA no cuenta como pasada.',
      'DEFERRED exige motivo, impacto y aprobador; sin aprobador cuenta como incluido.',
    ],
    ...result,
    sources: result.sources.map((s) => ({ ...s, location: relative(root, resolve(s.location)) })),
  };

  mkdirSync(dirname(resolve(root, args.out)), { recursive: true });
  writeFileSync(resolve(root, args.out), `${JSON.stringify(index, null, 2)}\n`, 'utf8');

  if (args.writeAudit) {
    writeFileSync(
      join(root, 'docs/audit/use-case-compliance-audit.json'),
      `${JSON.stringify(toAuditJson(index), null, 2)}\n`,
      'utf8',
    );
    writeFileSync(
      join(root, 'docs/audit/use-case-compliance-audit.md'),
      renderAuditMarkdown(index),
      'utf8',
    );
  }

  printSummary(result);
  if (result.invalid.length > 0) process.exitCode = 2;
  else if (args.strict && !result.summary.strictPass) process.exitCode = 1;
}

if (require.main === module) main();
