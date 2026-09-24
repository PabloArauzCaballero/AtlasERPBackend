/**
 * Auditoría de casos de uso del ERP — ahora basada en EVIDENCIA (P-02 / B03).
 *
 * Hasta el 2026-09-24 este guion clasificaba los 258 casos con listas y palabras clave y fijaba
 * `runtimeScopePass: true`, así que el informe decía «APROBADO» sin ejecutar nada. Esa lógica se
 * retiró: la clasificación de entonces se conserva como `declaredClassification` en
 * `docs/compliance/release-scope.json` y el estado real lo decide `scripts/compliance/evaluate.ts`
 * con resultados de pruebas sellados con el SHA del candidato.
 *
 * Este archivo sólo delega para no romper `yarn audit:use-cases` ni las referencias al guion.
 * Acepta los mismos argumentos que el evaluador (p. ej. `--results-dir compliance-results`).
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const result = spawnSync(
  process.execPath,
  [
    join(process.cwd(), 'node_modules/tsx/dist/cli.mjs'),
    join(process.cwd(), 'scripts/compliance/evaluate.ts'),
    '--write-audit',
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
