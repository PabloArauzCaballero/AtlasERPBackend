import {
  evaluate,
  type EvaluationInput,
  type EvidenceSource,
  type RequirementInput,
  type UseCaseInput,
} from '../scripts/compliance/evaluator';

/**
 * Evaluador de la matriz de cumplimiento (P-02 / B03). Los criterios de aceptación del plan:
 * un caso incluido sin prueba, una prueba fallida o un SHA distinto hacen fallar la matriz; uno
 * diferido aparece visible y no se cuenta en cumplimiento.
 */

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const FILE = 'test/ejemplo.integration.spec.ts';

function requirement(overrides: Partial<RequirementInput> = {}): RequirementInput {
  return {
    requirementId: 'B99',
    packageId: 'P-99',
    repository: 'AtlasERPBackend',
    title: 'Requisito de prueba',
    releaseIncluded: true,
    ownerRole: 'E',
    acceptance: 'criterio',
    tests: [{ file: FILE, name: 'suite caso A' }],
    blockedBy: null,
    ...overrides,
  };
}

function jestSource(
  statuses: Record<string, string>,
  options: { sha?: string; tamper?: boolean; file?: string } = {},
): EvidenceSource {
  return {
    location: 'compliance-results/x.jest.json.evidence.json',
    actualSha256: options.tamper ? 'alterado' : 'hash',
    stamp: {
      kind: 'jest',
      sha: options.sha ?? SHA,
      command: 'yarn test:integration',
      environment: 'ci',
      finishedAt: '2026-09-24T00:00:00.000Z',
      resultsFile: 'x.jest.json',
      resultsSha256: 'hash',
    },
    jest: {
      testResults: [
        {
          name: `/home/runner/work/repo/${options.file ?? FILE}`,
          assertionResults: Object.entries(statuses).map(([fullName, status]) => ({
            fullName,
            title: fullName.split(' ').slice(1).join(' '),
            status,
          })),
        },
      ],
    },
  };
}

function run(overrides: Partial<EvaluationInput>) {
  return evaluate({
    candidateSha: SHA,
    requirements: [],
    useCases: [],
    sources: [],
    fileExists: () => true,
    ...overrides,
  });
}

describe('Evaluador de cumplimiento basado en evidencia', () => {
  it('declara VERIFIED sólo cuando todas las pruebas pasaron en el SHA del candidato', () => {
    const result = run({
      requirements: [
        requirement({
          tests: [
            { file: FILE, name: 'suite caso A' },
            { file: FILE, name: 'suite caso B' },
          ],
        }),
      ],
      sources: [jestSource({ 'suite caso A': 'passed', 'suite caso B': 'passed' })],
    });
    expect(result.requirements[0]!.status).toBe('VERIFIED');
    expect(result.summary.requirements.compliance).toBe('1/1 incluidos verificados');
    expect(result.summary.strictPass).toBe(true);
    expect(result.requirements[0]!.evidence[0]).toMatchObject({ sha: SHA, result: 'passed' });
  });

  it('incluido sin prueba: DECLARED y la matriz estricta falla', () => {
    const result = run({ requirements: [requirement({ tests: [] })] });
    expect(result.requirements[0]!.status).toBe('DECLARED');
    expect(result.summary.requirements.compliance).toBe('0/1 incluidos verificados');
    expect(result.summary.strictPass).toBe(false);
  });

  it('prueba fallida: no se verifica y la matriz estricta falla', () => {
    const result = run({
      requirements: [requirement()],
      sources: [jestSource({ 'suite caso A': 'failed' })],
    });
    expect(result.requirements[0]!.status).toBe('IMPLEMENTED');
    expect(result.requirements[0]!.reasons).toContain(`FAILED: ${FILE} › suite caso A`);
    expect(result.summary.strictPass).toBe(false);
  });

  it('resultados de un SHA distinto se rechazan enteros y la matriz falla', () => {
    const result = run({
      requirements: [requirement()],
      sources: [jestSource({ 'suite caso A': 'passed' }, { sha: OTHER_SHA })],
    });
    expect(result.sources[0]).toMatchObject({ accepted: false });
    expect(result.sources[0]!.reason).toContain('SHA_DISTINTO');
    expect(result.requirements[0]!.status).toBe('IMPLEMENTED');
    expect(result.summary.strictPass).toBe(false);
  });

  it('resultados alterados después de sellarlos se rechazan', () => {
    const result = run({
      requirements: [requirement()],
      sources: [jestSource({ 'suite caso A': 'passed' }, { tamper: true })],
    });
    expect(result.sources[0]!.reason).toContain('RESULTADOS_ALTERADOS');
    expect(result.requirements[0]!.status).not.toBe('VERIFIED');
  });

  it('prueba saltada no cuenta como pasada', () => {
    const result = run({
      requirements: [requirement()],
      sources: [jestSource({ 'suite caso A': 'pending' })],
    });
    expect(result.requirements[0]!.status).toBe('IMPLEMENTED');
    expect(result.requirements[0]!.evidence[0]!.result).toBe('skipped');
  });

  it('prueba que no aparece en los resultados no cuenta como pasada', () => {
    const result = run({
      requirements: [requirement()],
      sources: [jestSource({ 'suite otro caso': 'passed' })],
    });
    expect(result.requirements[0]!.evidence[0]!.result).toBe('not-run');
    expect(result.requirements[0]!.status).toBe('IMPLEMENTED');
  });

  it('archivo de prueba inexistente deja el requisito en DECLARED', () => {
    const result = run({ requirements: [requirement()], fileExists: () => false });
    expect(result.requirements[0]!.status).toBe('DECLARED');
  });

  it('un prefijo que coincide con dos pruebas distintas es ambiguo y no verifica', () => {
    const result = run({
      requirements: [requirement({ tests: [{ file: FILE, name: 'suite caso' }] })],
      sources: [jestSource({ 'suite caso A': 'passed', 'suite caso B': 'passed' })],
    });
    expect(result.requirements[0]!.evidence[0]!.result).toBe('ambiguous');
    expect(result.requirements[0]!.status).not.toBe('VERIFIED');
  });

  it('diferido con aprobación: visible y fuera del denominador', () => {
    const result = run({
      requirements: [
        requirement({ requirementId: 'B01' }),
        requirement({
          requirementId: 'B02',
          releaseIncluded: false,
          tests: [],
          exclusion: {
            reason: 'Fuera del piloto',
            impact: 'Sin API externa',
            approvedBy: 'R: Ana',
          },
        }),
      ],
      sources: [jestSource({ 'suite caso A': 'passed' })],
    });
    const deferred = result.requirements.find((r) => r.id === 'B02')!;
    expect(deferred.status).toBe('DEFERRED');
    expect(result.summary.requirements).toMatchObject({ total: 2, included: 1, deferred: 1 });
    expect(result.summary.requirements.compliance).toBe('1/1 incluidos verificados');
    expect(result.summary.strictPass).toBe(true);
  });

  it('exclusión sin aprobador sigue contando como incluida y visible', () => {
    const result = run({
      requirements: [
        requirement({
          releaseIncluded: false,
          tests: [],
          exclusion: { reason: 'Motivo', impact: 'Impacto', approvedBy: null },
        }),
      ],
    });
    expect(result.requirements[0]!.status).toBe('DECLARED');
    expect(result.requirements[0]!.countedAsIncluded).toBe(true);
    expect(result.summary.requirements.unapprovedExclusions).toBe(1);
    expect(result.summary.strictPass).toBe(false);
  });

  it('MODEL_SUPPORTED sin pruebas nunca se vuelve VERIFIED', () => {
    const useCase: UseCaseInput = {
      id: 'UC_X',
      name: 'Caso',
      module: 'Módulo',
      declaredClassification: 'MODEL_SUPPORTED',
      releaseIncluded: true,
      tests: [],
    };
    const result = run({
      useCases: [useCase],
      sources: [jestSource({ 'suite caso A': 'passed' })],
    });
    expect(result.useCases[0]!.status).toBe('DECLARED');
    expect(result.summary.strictPass).toBe(false);
  });

  it('una decisión de alcance pendiente queda fuera del denominador pero hace fallar el modo estricto', () => {
    const result = run({ requirements: [requirement({ releaseIncluded: null, tests: [] })] });
    expect(result.summary.requirements).toMatchObject({ included: 0, pendingScopeDecision: 1 });
    expect(result.summary.strictPass).toBe(false);
  });

  it('blockedBy deja el requisito BLOCKED aunque sus pruebas pasen', () => {
    const result = run({
      requirements: [requirement({ blockedBy: 'Proveedor real no disponible' })],
      sources: [jestSource({ 'suite caso A': 'passed' })],
    });
    expect(result.requirements[0]!.status).toBe('BLOCKED');
  });

  it('comando sellado con código 0 en el SHA verifica; con otro código no', () => {
    const command = (exitCode: number): EvidenceSource => ({
      location: 'c.evidence.json',
      stamp: {
        kind: 'command',
        sha: SHA,
        command: 'yarn check:upgrade-path',
        environment: 'ci',
        finishedAt: 'x',
        name: 'upgrade-path',
        exitCode,
      },
    });
    const req = requirement({ tests: [], commands: [{ name: 'upgrade-path' }] });
    expect(run({ requirements: [req], sources: [command(0)] }).requirements[0]!.status).toBe(
      'VERIFIED',
    );
    expect(run({ requirements: [req], sources: [command(1)] }).requirements[0]!.status).toBe(
      'IMPLEMENTED',
    );
  });

  it('rechaza requisitos mal formados o duplicados', () => {
    const result = run({
      requirements: [
        requirement(),
        requirement(),
        { ...requirement(), title: '' } as RequirementInput,
      ],
    });
    expect(result.invalid.some((e) => e.includes('duplicado B99@P-99'))).toBe(true);
    expect(result.invalid.some((e) => e.includes('«title»'))).toBe(true);
    expect(result.summary.strictPass).toBe(false);
  });

  it('agrega un mismo ID de varios paquetes: sólo VERIFIED si todos lo están', () => {
    const result = run({
      requirements: [
        requirement({ requirementId: 'B08', packageId: 'P-04' }),
        requirement({ requirementId: 'B08', packageId: 'P-08', tests: [] }),
      ],
      sources: [jestSource({ 'suite caso A': 'passed' })],
    });
    expect(result.byRequirementId).toEqual([
      { requirementId: 'B08', packages: ['P-04', 'P-08'], status: 'DECLARED' },
    ]);
  });
});
