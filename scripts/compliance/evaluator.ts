/**
 * Evaluador de cumplimiento basado en EVIDENCIA (P-02 / B03).
 *
 * Sustituye a la matriz que fijaba `runtimeScopePass: true` y clasificaba por palabras clave. Aquí
 * un requisito o caso de uso sólo es VERIFIED si TODAS sus pruebas (o comandos) pasaron en el SHA
 * exacto del candidato. Reglas:
 *
 * - Una clasificación documental (p. ej. MODEL_SUPPORTED) nunca aporta evidencia: sin pruebas es
 *   DECLARED, diga lo que diga el informe histórico.
 * - Prueba saltada, pendiente o `todo` ≠ pasada. Prueba que no aparece en los resultados ≠ pasada.
 * - Resultados de otro SHA, sin sello o con el archivo alterado se rechazan enteros.
 * - `blockedBy` ⇒ BLOCKED aunque alguna prueba pase: falta algo que el repositorio no puede aportar.
 * - Exclusión (`releaseIncluded: false`) sólo es DEFERRED con motivo, impacto y aprobador. Sin
 *   aprobador sigue contando como incluida (y se marca).
 * - `releaseIncluded: null` es una decisión de alcance pendiente: fuera del denominador, pero
 *   visible y bloqueante en modo estricto.
 *
 * Este módulo es puro (sin E/S) para poder probarlo; la CLI está en `evaluate.ts`.
 */

export type EvidenceStatus = 'DECLARED' | 'IMPLEMENTED' | 'VERIFIED' | 'BLOCKED' | 'DEFERRED';
export type TestOutcome = 'passed' | 'failed' | 'skipped' | 'not-run' | 'ambiguous';

export interface TestRef {
  file: string;
  name: string;
}

export interface CommandRef {
  name: string;
}

export interface Exclusion {
  reason: string | null;
  impact: string | null;
  approvedBy: string | null;
  approvedAt?: string | null;
}

export interface RequirementInput {
  requirementId: string;
  packageId: string;
  repository: string;
  title: string;
  releaseIncluded: boolean | null;
  ownerRole: string;
  acceptance: string;
  tests: TestRef[];
  commands?: CommandRef[];
  requiresDatabase?: boolean;
  blockedBy: string | null;
  exclusion?: Exclusion | null;
  sourceFile?: string;
}

export interface UseCaseInput {
  id: string;
  name: string;
  module: string;
  declaredClassification: string;
  releaseIncluded: boolean | null;
  pendingDecision?: string | null;
  exclusion?: Exclusion | null;
  tests?: TestRef[];
  requirementIds?: string[];
  blockedBy?: string | null;
}

export interface JestAssertion {
  fullName: string;
  title: string;
  status: string;
}

export interface JestFileResult {
  name: string;
  assertionResults: JestAssertion[];
}

export interface EvidenceStamp {
  kind: 'jest' | 'command';
  sha: string;
  command: string;
  environment: string;
  finishedAt: string;
  artifact?: string | null;
  /** jest */
  resultsFile?: string;
  resultsSha256?: string;
  /** command */
  name?: string;
  exitCode?: number;
}

export interface EvidenceSource {
  stamp: EvidenceStamp;
  /** sha256 real del archivo de resultados (lo calcula la CLI). */
  actualSha256?: string;
  jest?: { testResults: JestFileResult[] };
  location: string;
}

export interface EvidenceEntry {
  kind: 'test' | 'command';
  ref: string;
  result: TestOutcome;
  sha: string | null;
  environment: string | null;
  command: string | null;
  date: string | null;
  artifact: string | null;
}

export interface EvaluatedItem {
  kind: 'requirement' | 'useCase';
  id: string;
  packageId: string | null;
  title: string;
  releaseIncluded: boolean | null;
  countedAsIncluded: boolean;
  declaredClassification: string | null;
  ownerRole: string | null;
  status: EvidenceStatus;
  reasons: string[];
  blockedBy: string | null;
  evidence: EvidenceEntry[];
}

export interface CountSummary {
  total: number;
  included: number;
  verifiedIncluded: number;
  pendingScopeDecision: number;
  deferred: number;
  unapprovedExclusions: number;
  byStatus: Record<EvidenceStatus, number>;
  compliance: string;
}

export interface EvaluationResult {
  candidateSha: string;
  sources: Array<{
    location: string;
    kind: string;
    sha: string;
    environment: string;
    command: string;
    finishedAt: string;
    accepted: boolean;
    reason: string | null;
  }>;
  invalid: string[];
  requirements: EvaluatedItem[];
  useCases: EvaluatedItem[];
  byRequirementId: Array<{ requirementId: string; packages: string[]; status: EvidenceStatus }>;
  summary: { requirements: CountSummary; useCases: CountSummary; strictPass: boolean };
}

export interface EvaluationInput {
  candidateSha: string;
  requirements: RequirementInput[];
  useCases: UseCaseInput[];
  sources: EvidenceSource[];
  /** ¿existe este archivo de prueba en el árbol? (lo resuelve la CLI). */
  fileExists: (path: string) => boolean;
}

const SKIPPED = new Set(['pending', 'skipped', 'todo', 'disabled', 'focused']);

export function validateRequirement(value: unknown, where: string): string[] {
  const errors: string[] = [];
  const r = value as Partial<RequirementInput> | null;
  if (!r || typeof r !== 'object') return [`${where}: no es un objeto`];
  for (const field of [
    'requirementId',
    'packageId',
    'repository',
    'title',
    'ownerRole',
    'acceptance',
  ] as const) {
    if (typeof r[field] !== 'string' || (r[field] as string).trim() === '') {
      errors.push(`${where}: falta «${field}»`);
    }
  }
  if (!(r.releaseIncluded === true || r.releaseIncluded === false || r.releaseIncluded === null)) {
    errors.push(`${where}: «releaseIncluded» debe ser true, false o null`);
  }
  if (!Array.isArray(r.tests)) errors.push(`${where}: «tests» debe ser un array`);
  else
    r.tests.forEach((t, i) => {
      if (!t || typeof t.file !== 'string' || typeof t.name !== 'string' || !t.file || !t.name) {
        errors.push(`${where}: tests[${i}] necesita «file» y «name»`);
      }
    });
  if (r.commands !== undefined && !Array.isArray(r.commands)) {
    errors.push(`${where}: «commands» debe ser un array`);
  }
  if (!(r.blockedBy === null || typeof r.blockedBy === 'string')) {
    errors.push(`${where}: «blockedBy» debe ser null o texto`);
  }
  return errors;
}

function acceptSources(input: EvaluationInput): {
  accepted: EvidenceSource[];
  report: EvaluationResult['sources'];
} {
  const accepted: EvidenceSource[] = [];
  const report: EvaluationResult['sources'] = [];
  for (const source of input.sources) {
    const { stamp } = source;
    let reason: string | null = null;
    if (!stamp || !stamp.sha) reason = 'SIN_SELLO';
    else if (stamp.sha !== input.candidateSha) reason = `SHA_DISTINTO (${stamp.sha})`;
    else if (stamp.kind === 'jest') {
      if (!source.jest) reason = 'RESULTADOS_JEST_AUSENTES';
      else if (!stamp.resultsSha256 || stamp.resultsSha256 !== source.actualSha256) {
        reason = 'RESULTADOS_ALTERADOS (sha256 no coincide con el sello)';
      }
    } else if (stamp.kind === 'command') {
      if (!stamp.name || typeof stamp.exitCode !== 'number') reason = 'SELLO_DE_COMANDO_INCOMPLETO';
    } else reason = 'TIPO_DESCONOCIDO';

    if (!reason) accepted.push(source);
    report.push({
      location: source.location,
      kind: stamp?.kind ?? 'desconocido',
      sha: stamp?.sha ?? '',
      environment: stamp?.environment ?? '',
      command: stamp?.command ?? '',
      finishedAt: stamp?.finishedAt ?? '',
      accepted: !reason,
      reason,
    });
  }
  return { accepted, report };
}

function normalize(path: string): string {
  return path.replace(/\\/g, '/');
}

function findTest(sources: EvidenceSource[], ref: TestRef): EvidenceEntry {
  const matches: Array<{ assertion: JestAssertion; source: EvidenceSource }> = [];
  const file = normalize(ref.file).replace(/^\.\//, '');
  for (const source of sources) {
    if (source.stamp.kind !== 'jest' || !source.jest) continue;
    for (const fileResult of source.jest.testResults) {
      const name = normalize(fileResult.name);
      if (name !== file && !name.endsWith(`/${file}`)) continue;
      for (const assertion of fileResult.assertionResults) {
        if (
          assertion.fullName === ref.name ||
          assertion.title === ref.name ||
          assertion.fullName.startsWith(ref.name) ||
          assertion.title.startsWith(ref.name)
        ) {
          matches.push({ assertion, source });
        }
      }
    }
  }
  const base = { kind: 'test' as const, ref: `${ref.file} › ${ref.name}` };
  if (matches.length === 0) {
    return {
      ...base,
      result: 'not-run',
      sha: null,
      environment: null,
      command: null,
      date: null,
      artifact: null,
    };
  }
  // El mismo test en dos corridas del mismo SHA (p. ej. reintento) cuenta si TODAS pasan.
  const titles = new Set(matches.map((m) => m.assertion.fullName));
  const first = matches[0]!;
  const stampInfo = {
    sha: first.source.stamp.sha,
    environment: first.source.stamp.environment,
    command: first.source.stamp.command,
    date: first.source.stamp.finishedAt,
    artifact: first.source.stamp.artifact ?? first.source.location,
  };
  if (titles.size > 1) return { ...base, result: 'ambiguous', ...stampInfo };
  const statuses = matches.map((m) => m.assertion.status);
  let result: TestOutcome = 'passed';
  if (statuses.some((s) => s === 'failed')) result = 'failed';
  else if (statuses.some((s) => SKIPPED.has(s))) result = 'skipped';
  else if (!statuses.every((s) => s === 'passed')) result = 'failed';
  return { ...base, result, ...stampInfo };
}

function findCommand(sources: EvidenceSource[], ref: CommandRef): EvidenceEntry {
  const runs = sources.filter((s) => s.stamp.kind === 'command' && s.stamp.name === ref.name);
  const base = { kind: 'command' as const, ref: ref.name };
  if (runs.length === 0) {
    return {
      ...base,
      result: 'not-run',
      sha: null,
      environment: null,
      command: null,
      date: null,
      artifact: null,
    };
  }
  const run = runs[0]!;
  return {
    ...base,
    result: runs.every((r) => r.stamp.exitCode === 0) ? 'passed' : 'failed',
    sha: run.stamp.sha,
    environment: run.stamp.environment,
    command: run.stamp.command,
    date: run.stamp.finishedAt,
    artifact: run.stamp.artifact ?? run.location,
  };
}

function exclusionApproved(exclusion: Exclusion | null | undefined): boolean {
  return Boolean(
    exclusion &&
    exclusion.reason?.trim() &&
    exclusion.impact?.trim() &&
    exclusion.approvedBy?.trim(),
  );
}

function evaluateItem(
  base: Omit<EvaluatedItem, 'status' | 'reasons' | 'evidence' | 'countedAsIncluded'> & {
    exclusion?: Exclusion | null;
    tests: TestRef[];
    commands: CommandRef[];
  },
  sources: EvidenceSource[],
  fileExists: (path: string) => boolean,
): EvaluatedItem {
  const reasons: string[] = [];
  const { exclusion, tests, commands, ...item } = base;
  let countedAsIncluded = item.releaseIncluded === true;

  if (item.releaseIncluded === false) {
    if (exclusionApproved(exclusion)) {
      return {
        ...item,
        countedAsIncluded: false,
        status: 'DEFERRED',
        reasons: [`Excluido con aprobación de ${exclusion!.approvedBy}: ${exclusion!.reason}`],
        evidence: [],
      };
    }
    countedAsIncluded = true;
    reasons.push('EXCLUSION_SIN_APROBAR: sin motivo, impacto y aprobador sigue dentro del release');
  }
  if (item.releaseIncluded === null) reasons.push('DECISION_DE_ALCANCE_PENDIENTE');

  const evidence = [
    ...tests.map((t) => findTest(sources, t)),
    ...commands.map((c) => findCommand(sources, c)),
  ];
  const missingFiles = tests.filter((t) => !fileExists(t.file));
  missingFiles.forEach((t) => reasons.push(`ARCHIVO_DE_PRUEBA_INEXISTENTE: ${t.file}`));
  evidence
    .filter((e) => e.result !== 'passed')
    .forEach((e) => reasons.push(`${e.result.toUpperCase()}: ${e.ref}`));

  let status: EvidenceStatus;
  if (item.blockedBy) {
    status = 'BLOCKED';
    reasons.unshift(`BLOQUEADO: ${item.blockedBy}`);
  } else if (evidence.length === 0) {
    status = 'DECLARED';
    reasons.push('SIN_PRUEBAS_MAPEADAS: una clasificación documental no es evidencia');
  } else if (missingFiles.length === 0 && evidence.every((e) => e.result === 'passed')) {
    status = 'VERIFIED';
  } else if (tests.length > missingFiles.length || commands.length > 0) {
    status = 'IMPLEMENTED';
  } else {
    status = 'DECLARED';
  }
  return { ...item, countedAsIncluded, status, reasons, evidence };
}

function summarize(items: EvaluatedItem[]): CountSummary {
  const byStatus: Record<EvidenceStatus, number> = {
    DECLARED: 0,
    IMPLEMENTED: 0,
    VERIFIED: 0,
    BLOCKED: 0,
    DEFERRED: 0,
  };
  items.forEach((i) => (byStatus[i.status] += 1));
  const included = items.filter((i) => i.countedAsIncluded);
  const verifiedIncluded = included.filter((i) => i.status === 'VERIFIED').length;
  return {
    total: items.length,
    included: included.length,
    verifiedIncluded,
    pendingScopeDecision: items.filter((i) => i.releaseIncluded === null).length,
    deferred: byStatus.DEFERRED,
    unapprovedExclusions: items.filter(
      (i) => i.releaseIncluded === false && i.status !== 'DEFERRED',
    ).length,
    byStatus,
    compliance: `${verifiedIncluded}/${included.length} incluidos verificados`,
  };
}

export function evaluate(input: EvaluationInput): EvaluationResult {
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const r of input.requirements) {
    invalid.push(...validateRequirement(r, r.sourceFile ?? r.requirementId ?? '?'));
    const key = `${r.requirementId}@${r.packageId}`;
    if (seen.has(key)) invalid.push(`${r.sourceFile ?? '?'}: requisito duplicado ${key}`);
    seen.add(key);
  }
  const { accepted, report } = acceptSources(input);

  const requirements = input.requirements.map((r) =>
    evaluateItem(
      {
        kind: 'requirement',
        id: r.requirementId,
        packageId: r.packageId,
        title: r.title,
        releaseIncluded: r.releaseIncluded,
        declaredClassification: null,
        ownerRole: r.ownerRole,
        blockedBy: r.blockedBy,
        exclusion: r.exclusion ?? null,
        tests: r.tests ?? [],
        commands: r.commands ?? [],
      },
      accepted,
      input.fileExists,
    ),
  );

  const useCases = input.useCases.map((u) =>
    evaluateItem(
      {
        kind: 'useCase',
        id: u.id,
        packageId: null,
        title: `${u.module} · ${u.name}`,
        releaseIncluded: u.releaseIncluded,
        declaredClassification: u.declaredClassification,
        ownerRole: null,
        blockedBy: u.blockedBy ?? null,
        exclusion: u.exclusion ?? null,
        tests: u.tests ?? [],
        commands: [],
      },
      accepted,
      input.fileExists,
    ),
  );

  // Un mismo ID (p. ej. B08) puede venir de varios paquetes: sólo está VERIFIED si todos lo están.
  const grouped = new Map<string, EvaluatedItem[]>();
  requirements.forEach((r) => grouped.set(r.id, [...(grouped.get(r.id) ?? []), r]));
  const order: EvidenceStatus[] = ['BLOCKED', 'DECLARED', 'IMPLEMENTED', 'DEFERRED', 'VERIFIED'];
  const byRequirementId = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([requirementId, items]) => ({
      requirementId,
      packages: items.map((i) => i.packageId ?? '?'),
      status: order.find((s) => items.some((i) => i.status === s)) ?? 'DECLARED',
    }));

  const reqSummary = summarize(requirements);
  const ucSummary = summarize(useCases);
  const strictPass =
    invalid.length === 0 &&
    [reqSummary, ucSummary].every(
      (s) => s.included === s.verifiedIncluded && s.pendingScopeDecision === 0,
    );

  return {
    candidateSha: input.candidateSha,
    sources: report,
    invalid,
    requirements,
    useCases,
    byRequirementId,
    summary: { requirements: reqSummary, useCases: ucSummary, strictPass },
  };
}
