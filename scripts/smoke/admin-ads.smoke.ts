import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import pino from 'pino';
import { z } from 'zod';

const smokeEnvSchema = z.object({
  API_BASE_URL: z.string().url().default('http://localhost:3000/api/v1'),
  ATLAS_ADS_SMOKE_TOKEN: z.string().min(1).optional(),
  SMOKE_REPORT_PATH: z.string().min(1).default('scripts/smoke/admin-ads.smoke.result.json'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const smokeEnv = smokeEnvSchema.parse(process.env);
const logger = pino({
  name: 'atlas-ads-smoke',
  level: smokeEnv.LOG_LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: ['token', '*.token', 'headers.authorization', '*.headers.authorization'],
});

const baseUrl = smokeEnv.API_BASE_URL;
const token = smokeEnv.ATLAS_ADS_SMOKE_TOKEN;
const reportPath = resolve(smokeEnv.SMOKE_REPORT_PATH);

interface SmokeResult {
  method: string;
  path: string;
  status: number | null;
  ok: boolean;
  expectedProtectedFailure: boolean;
  error?: string;
  bodyPreview: string;
}

async function request(path: string, init: RequestInit = {}): Promise<SmokeResult> {
  const method = init.method ?? 'GET';
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const body = await response.text();
    const expectedProtectedFailure = !token && [401, 403].includes(response.status);
    const result = {
      method,
      path,
      status: response.status,
      ok: response.ok,
      expectedProtectedFailure,
      bodyPreview: body.slice(0, 1200),
    };
    logger.info({ method, path, status: response.status }, 'Smoke request completed');
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown network error';
    logger.error(
      { method, path, errorName: error instanceof Error ? error.name : 'UnknownError' },
      message,
    );
    return {
      method,
      path,
      status: null,
      ok: false,
      expectedProtectedFailure: false,
      error: message,
      bodyPreview: '',
    };
  }
}

async function main(): Promise<void> {
  const results = [
    await request('/health'),
    await request('/ready'),
    await request('/admin/ads/dashboard'),
    await request('/admin/ads/moderation/queue?status=PENDING_REVIEW'),
  ];

  const passed = results.every((result) => result.ok || result.expectedProtectedFailure);
  const report = {
    executedAt: new Date().toISOString(),
    baseUrl,
    tokenProvided: Boolean(token),
    passed,
    results,
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  logger.info({ reportPath, passed }, 'Smoke report written');

  if (!passed) {
    process.exitCode = 1;
  }
}

void main();
