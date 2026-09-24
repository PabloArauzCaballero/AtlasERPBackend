import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { UseCaseInput } from '../scripts/compliance/evaluator';

/**
 * Alcance del release (P-02 / B04): los 258 IDs del catálogo contable siguen todos presentes, con
 * su clasificación histórica, y ninguno sale del release sin motivo, impacto y aprobador.
 */

const root = join(__dirname, '..');
const catalog = JSON.parse(
  readFileSync(join(root, 'systemInfo/accounting/source-json/use_cases_catalog.json'), 'utf8'),
) as { modules: Record<string, Array<[string, string, string[]]>> };
const scope = JSON.parse(
  readFileSync(join(root, 'docs/compliance/release-scope.json'), 'utf8'),
) as {
  useCases: Array<UseCaseInput & { pendingDecision: string | null }>;
};

describe('Alcance del release contra el catálogo de casos de uso', () => {
  const catalogIds = Object.values(catalog.modules).flatMap((list) => list.map(([id]) => id));

  it('contiene exactamente los IDs del catálogo, sin perder ni inventar ninguno', () => {
    const scopeIds = scope.useCases.map((u) => u.id);
    expect(new Set(scopeIds).size).toBe(scopeIds.length);
    expect([...scopeIds].sort()).toEqual([...catalogIds].sort());
  });

  it('conserva la clasificación histórica 46/109/54/49 como dato declarado', () => {
    const counts: Record<string, number> = {};
    scope.useCases.forEach(
      (u) => (counts[u.declaredClassification] = (counts[u.declaredClassification] ?? 0) + 1),
    );
    expect(counts).toEqual({
      PRODUCTION_COVERED: 46,
      MODEL_SUPPORTED: 109,
      EXCLUDED_INTEGRATION_SCOPE: 54,
      DOCUMENTED_EXTENSION_POINT: 49,
    });
  });

  it('no hereda la exclusión de integración: los 54 quedan pendientes de decisión, no excluidos', () => {
    const integration = scope.useCases.filter(
      (u) => u.declaredClassification === 'EXCLUDED_INTEGRATION_SCOPE',
    );
    expect(integration).toHaveLength(54);
    integration.forEach((u) => {
      expect(u.releaseIncluded).toBeNull();
      expect(u.pendingDecision).toEqual(expect.any(String));
    });
  });

  it('ningún caso sale del release sin motivo, impacto y aprobador', () => {
    const excluded = scope.useCases.filter((u) => u.releaseIncluded === false);
    excluded.forEach((u) => {
      expect(u.exclusion?.reason).toBeTruthy();
      expect(u.exclusion?.impact).toBeTruthy();
      expect(u.exclusion?.approvedBy).toBeTruthy();
    });
  });

  it('todo caso sin decisión explica qué tiene que decidir el responsable', () => {
    scope.useCases
      .filter((u) => u.releaseIncluded === null)
      .forEach((u) => expect(u.pendingDecision).toEqual(expect.any(String)));
  });

  it('la auditoría publicada ya no declara APROBADO por construcción', () => {
    const markdown = readFileSync(join(root, 'docs/audit/use-case-compliance-audit.md'), 'utf8');
    const json = readFileSync(join(root, 'docs/audit/use-case-compliance-audit.json'), 'utf8');
    expect(markdown).not.toMatch(/APROBADO/);
    expect(json).not.toMatch(/"runtimeScopePass"\s*:/);
    expect(markdown).toContain('incluidos verificados');
  });
});
