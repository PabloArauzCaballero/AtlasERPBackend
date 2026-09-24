/**
 * Vista de los 258 casos de uso contables para `docs/audit/use-case-compliance-audit.{json,md}`,
 * generada desde el índice de evidencia (P-02). Sustituye al informe que decía «APROBADO» por
 * construcción: aquí no hay veredicto global, sólo conteos con su denominador.
 */
import type { CountSummary, EvaluatedItem, EvaluationResult } from './evaluator';

type Index = EvaluationResult & {
  generatedAt: string;
  environment: string;
  runUrl: string | null;
  scope: string;
};

export function toAuditJson(index: Index) {
  return {
    generatedAt: index.generatedAt,
    candidateSha: index.candidateSha,
    environment: index.environment,
    runUrl: index.runUrl,
    notice:
      'Generado por scripts/compliance/evaluate.ts desde evidencia ejecutada. Sustituye a la matriz ' +
      'de 2026-07-09 (runtimeScopePass fijo en true). La clasificación de entonces se conserva como ' +
      'declaredClassification y no cuenta como evidencia. Índice completo: docs/compliance/evidence-index.json.',
    scope: index.scope,
    summary: index.summary.useCases,
    strictPass: index.summary.strictPass,
    items: index.useCases.map((item) => ({
      id: item.id,
      title: item.title,
      declaredClassification: item.declaredClassification,
      releaseIncluded: item.releaseIncluded,
      status: item.status,
      reasons: item.reasons,
      evidence: item.evidence,
    })),
  };
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function summaryLines(label: string, s: CountSummary): string[] {
  return [
    `### ${label}`,
    '',
    `- Cumplimiento del release: **${s.compliance}** (denominador: sólo incluidos).`,
    `- Total registrados: ${s.total}. Pendientes de decisión de alcance: ${s.pendingScopeDecision}. Diferidos aprobados: ${s.deferred}. Exclusiones sin aprobar: ${s.unapprovedExclusions}.`,
    `- Por estado: ${Object.entries(s.byStatus)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ')}.`,
    '',
  ];
}

function scopeLabel(item: EvaluatedItem): string {
  if (item.releaseIncluded === true) return 'incluido';
  if (item.releaseIncluded === false)
    return item.status === 'DEFERRED' ? 'diferido' : 'excluido SIN aprobar';
  return 'pendiente';
}

export function renderAuditMarkdown(index: Index): string {
  const lines = [
    '# Auditoría de cumplimiento de casos de uso',
    '',
    '> Generado por `scripts/compliance/evaluate.ts` (`yarn audit:use-cases`). No edites este archivo a',
    '> mano. Sustituye a la matriz del 2026-07-09, cuyo veredicto global salía de `runtimeScopePass: true` y',
    '> de una clasificación por palabras clave. Aquí un caso sólo está VERIFIED si sus pruebas pasaron',
    '> en el SHA indicado; la clasificación histórica se conserva como referencia y **no es evidencia**.',
    '',
    `- SHA evaluado: \`${index.candidateSha}\` · entorno: ${index.environment} · generado: ${index.generatedAt}`,
    index.runUrl ? `- Ejecución: ${index.runUrl}` : '- Ejecución: local o sin resultados sellados',
    `- Fuentes de evidencia aceptadas: ${index.sources.filter((s) => s.accepted).length} de ${index.sources.length}`,
    `- Modo estricto: **${index.summary.strictPass ? 'PASA' : 'NO PASA'}**`,
    '',
    '## Resumen',
    '',
    ...summaryLines('Casos de uso del catálogo contable', index.summary.useCases),
    ...summaryLines(
      'Requisitos del plan de cumplimiento (docs/compliance/requirements)',
      index.summary.requirements,
    ),
    '## Estados',
    '',
    '| Estado | Significado |',
    '|---|---|',
    '| DECLARED | Sólo documentado o clasificado; sin prueba mapeada o con pruebas inexistentes. |',
    '| IMPLEMENTED | Hay prueba, pero no corrió, no pasó, se saltó o es de otro SHA. |',
    '| VERIFIED | Todas sus pruebas pasaron en el SHA evaluado. |',
    '| BLOCKED | Depende de algo externo al repositorio (`blockedBy`). |',
    '| DEFERRED | Excluido del release con motivo, impacto y aprobador. No suma cumplimiento. |',
    '',
    '## Matriz',
    '',
    '| ID | Caso | Clasificación histórica | Alcance | Estado | Motivos |',
    '|---|---|---|---|---|---|',
  ];
  for (const item of index.useCases) {
    lines.push(
      `| ${item.id} | ${escapeCell(item.title)} | ${item.declaredClassification ?? '-'} | ${scopeLabel(item)} | ${item.status} | ${escapeCell(item.reasons.slice(0, 3).join('; '))} |`,
    );
  }
  lines.push('');
  return `${lines.join('\n')}`;
}
