import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { sign } from 'jsonwebtoken';
import { PinoLoggerService } from '../../src/common/logger/pino-logger.service';

const logger = new PinoLoggerService();
const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1';
const jwtSecret = process.env.JWT_ACCESS_SECRET ?? 'change-this-secret-in-production';
const outputPath = process.env.SMOKE_OUTPUT_PATH ?? join(__dirname, 'accounting-smoke-result.json');

interface SmokeStepResult {
  name: string;
  method: string;
  path: string;
  expectedStatuses: number[];
  actualStatus?: number;
  ok: boolean;
  durationMs: number;
  responseBody?: unknown;
  error?: string;
}

interface SmokeReport {
  suite: string;
  baseUrl: string;
  startedAt: string;
  finishedAt: string;
  success: boolean;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  steps: SmokeStepResult[];
}

async function requestStep(
  name: string,
  path: string,
  expectedStatuses: number[],
  options: RequestInit = {},
): Promise<SmokeStepResult> {
  const startedAt = Date.now();
  const method = options.method ?? 'GET';

  try {
    const response = await fetch(`${baseUrl}${path}`, options);
    const bodyText = await response.text();
    const responseBody = parseBody(bodyText);
    const durationMs = Date.now() - startedAt;
    const ok = expectedStatuses.includes(response.status);

    logger.info('Smoke step ejecutado.', {
      layer: 'script',
      script: 'accounting-smoke',
      name,
      method,
      path,
      expectedStatuses,
      actualStatus: response.status,
      ok,
      durationMs,
    });

    return {
      name,
      method,
      path,
      expectedStatuses,
      actualStatus: response.status,
      ok,
      durationMs,
      responseBody,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logger.error('Smoke step falló por error de red o runtime.', {
      layer: 'script',
      script: 'accounting-smoke',
      name,
      method,
      path,
      error,
      durationMs,
    });

    return {
      name,
      method,
      path,
      expectedStatuses,
      ok: false,
      durationMs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function parseBody(value: string): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function saveReport(report: SmokeReport): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  logger.info('Resultado de smoke guardado.', {
    layer: 'script',
    script: 'accounting-smoke',
    outputPath,
    success: report.success,
    failedSteps: report.failedSteps,
  });
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const token = sign({ sub: '00000000-0000-0000-0000-000000000001', role: 'admin' }, jwtSecret, {
    expiresIn: '15m',
  });

  const uniqueSuffix = Date.now();
  const steps: SmokeStepResult[] = [];

  steps.push(await requestStep('health', '/health', [200]));
  steps.push(await requestStep('ready', '/ready', [200]));

  steps.push(
    await requestStep(
      '/accounting/financial-structure/legal-entities',
      '/accounting/financial-structure/legal-entities',
      [201, 200, 409],
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          code: `ATLAS-${uniqueSuffix}`,
          legalName: 'ATLAS Bolivia S.A.',
          taxId: '123456789',
          countryCode: 'BO',
          baseCurrency: 'BOB',
          timezone: 'America/La_Paz',
        }),
      },
    ),
  );

  const passedSteps = steps.filter((step) => step.ok).length;
  const report: SmokeReport = {
    suite: 'accounting-smoke',
    baseUrl,
    startedAt,
    finishedAt: new Date().toISOString(),
    success: passedSteps === steps.length,
    totalSteps: steps.length,
    passedSteps,
    failedSteps: steps.length - passedSteps,
    steps,
  };

  saveReport(report);

  if (!report.success) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  const report: SmokeReport = {
    suite: 'accounting-smoke',
    baseUrl,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    success: false,
    totalSteps: 0,
    passedSteps: 0,
    failedSteps: 1,
    steps: [
      {
        name: 'fatal-runtime-error',
        method: 'N/A',
        path: 'N/A',
        expectedStatuses: [],
        ok: false,
        durationMs: 0,
        error: error instanceof Error ? error.message : String(error),
      },
    ],
  };
  saveReport(report);
  logger.error('Smoke detenido por error fatal.', {
    layer: 'script',
    script: 'accounting-smoke',
    error,
  });
  process.exitCode = 1;
});
