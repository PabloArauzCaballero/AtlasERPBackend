/**
 * Falla si un documento del repositorio manda ejecutar un script que `package.json` no tiene
 * (P-15 / B17).
 *
 * Los informes de julio y agosto decían `yarn db:prepare`, `npm run db:rollback` o
 * `npm run db:migrate:status`, que no existen: quien los sigue recibe «Command not found» y concluye
 * que el repositorio está roto, o peor, que la base quedó a medias. Esta comprobación es estática
 * —lee los `.md` versionados y el `package.json`— y corre en CI sin base.
 *
 * Reconoce `yarn <script>`, `yarn run <script>`, `corepack yarn <script>`, `npm run <script>` y
 * `node --run <script>`. Ignora los subcomandos propios de yarn (`install`, `add`, `audit`…).
 * Si un documento necesita citar a propósito un comando retirado, que lo haga en una línea que
 * contenga `doc-commands:ignore` y explique por qué.
 *
 * Uso: tsx scripts/docs/check-doc-commands.ts
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Subcomandos de Yarn Classic que no son scripts del proyecto. */
const YARN_BUILTINS = new Set([
  'add',
  'audit',
  'autoclean',
  'bin',
  'cache',
  'check',
  'config',
  'create',
  'dlx',
  'exec',
  'generate-lock-entry',
  'global',
  'help',
  'import',
  'info',
  'init',
  'install',
  'licenses',
  'link',
  'list',
  'login',
  'logout',
  'node',
  'outdated',
  'owner',
  'pack',
  'policies',
  'publish',
  'remove',
  'tag',
  'team',
  'unlink',
  'unplug',
  'upgrade',
  'upgrade-interactive',
  'version',
  'versions',
  'why',
  'workspace',
  'workspaces',
]);

/** Palabras que siguen a «yarn» en prosa y no son un comando («yarn classic», «yarn.lock»). */
const PROSE_WORDS = new Set(['classic', 'berry', 'lock', 'lockfile', 'es', 'y', 'o', 'con']);

const COMMAND =
  /(?:corepack\s+)?(yarn|npm\s+run|node\s+--run)(?:\s+-s)?(?:\s+run)?\s+([a-z][a-z0-9:_.-]*)/g;

export interface DocCommandFinding {
  file: string;
  line: number;
  command: string;
  script: string;
}

export function findUnknownCommands(
  files: Array<{ path: string; content: string }>,
  scripts: Set<string>,
): DocCommandFinding[] {
  const findings: DocCommandFinding[] = [];
  for (const file of files) {
    file.content.split('\n').forEach((text, index) => {
      if (text.includes('doc-commands:ignore')) return;
      for (const match of text.matchAll(COMMAND)) {
        const runner = match[1]!;
        const script = match[2]!.replace(/[.:]+$/, '');
        if (runner === 'yarn' && (YARN_BUILTINS.has(script) || PROSE_WORDS.has(script))) continue;
        if (scripts.has(script)) continue;
        findings.push({ file: file.path, line: index + 1, command: match[0].trim(), script });
      }
    });
  }
  return findings;
}

function trackedMarkdown(root: string): string[] {
  const output = execFileSync('git', ['ls-files', '-z', '--', '*.md'], { cwd: root });
  return (
    output
      .toString('utf8')
      .split('\0')
      .filter((path) => path.length > 0 && !path.startsWith('node_modules/'))
      // `contracts/` es una copia byte a byte del contrato que publica AtlasBackend (ver su
      // ORIGIN.json): sus comandos son los de ese repo y no se puede editar sin romper la sincronía.
      .filter((path) => !path.startsWith('contracts/'))
  );
}

function main(): void {
  const root = process.cwd();
  const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  const scripts = new Set(Object.keys(packageJson.scripts));
  const files = trackedMarkdown(root).map((path) => ({
    path,
    content: readFileSync(resolve(root, path), 'utf8'),
  }));
  const findings = findUnknownCommands(files, scripts);
  if (findings.length > 0) {
    process.stderr.write(
      `❌ ${findings.length} comando(s) documentado(s) que package.json no tiene:\n` +
        findings.map((f) => `   ${f.file}:${f.line}  ${f.command}`).join('\n') +
        '\n',
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`✅ ${files.length} documentos: todos los comandos citados existen.\n`);
}

if (require.main === module) main();
