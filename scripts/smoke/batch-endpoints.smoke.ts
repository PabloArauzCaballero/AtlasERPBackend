import 'dotenv/config';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { sign } from 'jsonwebtoken';
import pino from 'pino';
import { resolveSmokeBaseUrl } from './smoke-base-url';

const API_BASE_URL = resolveSmokeBaseUrl();
const JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? 'change_me_long_random_secret_32_chars_min';
const REPORT_PATH = resolve(
  process.env.SMOKE_BATCH_REPORT_PATH ?? 'scripts/smoke/batch-endpoints.smoke.result.json',
);

const logger = pino({
  name: 'atlas-batch-endpoints-smoke',
  level: process.env.LOG_LEVEL ?? 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: ['headers.authorization', '*.token'],
});

interface SmokeStep {
  name: string;
  method: string;
  path: string;
  expectedStatuses: number[];
  actualStatus: number | null;
  ok: boolean;
  durationMs: number;
  bodyPreview: string;
  error?: string;
}

function buildToken(): string {
  const overrideToken = process.env.ATLAS_BATCH_SMOKE_TOKEN;
  if (overrideToken) return overrideToken;

  return sign(
    {
      sub: '00000000-0000-0000-0000-000000000001',
      roles: ['ADMIN', 'admin', 'ADS_ADMIN_MANAGER', 'ADS_EVENT_TRACKER'],
      roleCode: 'ADMIN',
    },
    JWT_ACCESS_SECRET,
    {
      expiresIn: '15m',
      issuer: process.env.JWT_ACCESS_ISSUER ?? 'atlas-erp',
      audience: process.env.JWT_ACCESS_AUDIENCE ?? 'atlas-erp-api',
    },
  );
}

function duplicateB2BAccountsPayload() {
  const item = {
    legalName: 'Smoke Batch Comercio S.R.L.',
    tradeName: 'Smoke Batch Comercio',
    taxId: 'SMOKE-B2B-001',
    accountType: 'MERCHANT',
    primaryContact: { fullName: 'Smoke Tester', email: 'smoke@example.com' },
  };

  return { batchExternalId: 'smoke-b2b-duplicate-validation', items: [item, item] };
}

function duplicateAccountingDocumentsPayload() {
  const document = {
    legalEntityId: '00000000-0000-0000-0000-000000000010',
    sourceSystem: 'SMOKE',
    sourceType: 'BATCH_VALIDATION',
    sourceId: 'SMOKE-DOC-001',
    documentType: 'JOURNAL',
    documentNo: 'SMOKE-DOC-001',
    documentDate: '2026-08-31',
    postingDate: '2026-08-31',
    accountingPeriodId: '00000000-0000-0000-0000-000000000011',
    ledgerId: '00000000-0000-0000-0000-000000000012',
    currencyCode: 'BOB',
    lines: [
      {
        glAccountId: '00000000-0000-0000-0000-000000000013',
        debit: 100,
        credit: 0,
        currencyCode: 'BOB',
        amountLc: 100,
      },
      {
        glAccountId: '00000000-0000-0000-0000-000000000014',
        debit: 0,
        credit: 100,
        currencyCode: 'BOB',
        amountLc: -100,
      },
    ],
  };

  return { batchExternalId: 'smoke-accounting-duplicate-validation', items: [document, document] };
}

function duplicateAdvertisersPayload() {
  const item = {
    legalName: 'Smoke Ads S.R.L.',
    tradeName: 'Smoke Ads',
    taxId: 'SMOKE-ADS-001',
    country: 'BO',
    billingMode: 'POSTPAID',
    currency: 'BOB',
  };

  return { batchExternalId: 'smoke-ads-duplicate-validation', items: [item, item] };
}

async function requestStep(
  name: string,
  path: string,
  expectedStatuses: number[],
  body?: unknown,
): Promise<SmokeStep> {
  const startedAt = Date.now();
  const method = body === undefined ? 'GET' : 'POST';

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${buildToken()}`,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const responseText = await response.text();
    const step = {
      name,
      method,
      path,
      expectedStatuses,
      actualStatus: response.status,
      ok: expectedStatuses.includes(response.status),
      durationMs: Date.now() - startedAt,
      bodyPreview: responseText.slice(0, 1200),
    };

    logger.info(
      { name, method, path, statusCode: response.status, ok: step.ok },
      'Batch smoke step completed',
    );
    return step;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      { name, method, path, errorName: error instanceof Error ? error.name : 'UnknownError' },
      message,
    );
    return {
      name,
      method,
      path,
      expectedStatuses,
      actualStatus: null,
      ok: false,
      durationMs: Date.now() - startedAt,
      bodyPreview: '',
      error: message,
    };
  }
}

async function main(): Promise<void> {
  const steps: SmokeStep[] = [
    await requestStep('health', '/health', [200]),
    await requestStep('ready', '/ready', [200]),
    await requestStep(
      'b2b accounts bulk validation',
      '/b2b/accounts/bulk',
      [400],
      duplicateB2BAccountsPayload(),
    ),
    await requestStep(
      'accounting documents bulk validation',
      '/accounting/documents/bulk',
      [400],
      duplicateAccountingDocumentsPayload(),
    ),
    await requestStep(
      'ads advertisers bulk validation',
      '/admin/ads/advertisers/bulk',
      [400],
      duplicateAdvertisersPayload(),
    ),
    await requestStep('ads events bulk validation', '/ads/events/bulk', [400], {
      batchExternalId: 'smoke-events-empty',
      items: [],
    }),
  ];

  const passed = steps.every((step) => step.ok);
  const report = {
    suite: 'batch-endpoints-smoke',
    executedAt: new Date().toISOString(),
    baseUrl: API_BASE_URL,
    strategy:
      'validation-only: expected 400 proves route, guard, and Zod pipe are reachable without creating records',
    passed,
    steps,
  };

  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  logger.info({ reportPath: REPORT_PATH, passed }, 'Batch smoke report written');

  if (!passed) process.exitCode = 1;
}

void main();
