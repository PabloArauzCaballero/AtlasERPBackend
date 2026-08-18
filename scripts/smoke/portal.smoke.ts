/**
 * Smoke del portal del comercio (`/api/v1/portal/*`).
 *
 * A diferencia de los otros smokes, aquí no basta con "el endpoint responde": el portal es el
 * único canal donde un usuario partner toca CRM, contabilidad y publicidad a la vez, así que lo
 * que hay que verificar en un entorno desplegado es que el alcance sea **fail-closed**:
 *
 * - sin token, todo `/portal/*` responde 401/403 (nunca 200);
 * - con token, un identificador de otro comercio responde 403 (nunca 200 ni 404 silencioso);
 * - con token, un query inválido responde 400 antes de tocar la base.
 *
 * Los casos de alcance cruzado necesitan identificadores reales del entorno; se omiten (y se
 * reportan como omitidos) si no se proveen, para que el smoke siga siendo ejecutable en local.
 */
import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import pino from 'pino';
import { z } from 'zod';

const smokeEnvSchema = z.object({
  API_BASE_URL: z.string().url().default('http://localhost:3000/api/v1'),
  ATLAS_PORTAL_SMOKE_TOKEN: z.string().min(1).optional(),
  /** Cuenta B2B que NO pertenece al dueño del token: debe responder 403. */
  ATLAS_PORTAL_SMOKE_FOREIGN_ACCOUNT_ID: z.string().uuid().optional(),
  /** Anunciante que NO pertenece al dueño del token: debe responder 403. */
  ATLAS_PORTAL_SMOKE_FOREIGN_ADVERTISER_ID: z.string().uuid().optional(),
  /** Campaña de otro comercio: el toggle debe responder 403. */
  ATLAS_PORTAL_SMOKE_FOREIGN_CAMPAIGN_ID: z.string().uuid().optional(),
  SMOKE_REPORT_PATH: z.string().min(1).default('scripts/smoke/portal.smoke.result.json'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const smokeEnv = smokeEnvSchema.parse(process.env);
const logger = pino({
  name: 'atlas-portal-smoke',
  level: smokeEnv.LOG_LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: ['token', '*.token', 'headers.authorization', '*.headers.authorization'],
});

const baseUrl = smokeEnv.API_BASE_URL;
const token = smokeEnv.ATLAS_PORTAL_SMOKE_TOKEN;
const reportPath = resolve(smokeEnv.SMOKE_REPORT_PATH);

/** Qué se espera de cada caso, en términos de la invariante que protege. */
type Expectation =
  /** Debe responder 2xx (o 401/403 si el smoke corre sin token). */
  | 'reachable'
  /** Debe responder 403: el recurso pertenece a otro comercio. */
  | 'denied'
  /** Debe responder 400: el query no valida contra el schema. */
  | 'rejected';

interface SmokeCase {
  name: string;
  method: string;
  path: string;
  body?: unknown;
  expect: Expectation;
  /** Invariante de negocio que el caso protege; se copia al reporte. */
  guards: string;
}

interface SmokeResult extends Omit<SmokeCase, 'body'> {
  status: number | null;
  passed: boolean;
  error?: string;
  bodyPreview: string;
}

const ANY_UUID = '00000000-0000-0000-0000-000000000000';

function isSatisfied(expectation: Expectation, status: number): boolean {
  // Sin token el guard corta antes que cualquier regla de alcance o de schema: 401/403 es la
  // única respuesta correcta para todo el portal, sea cual sea el caso.
  if (!token) return status === 401 || status === 403;

  switch (expectation) {
    case 'reachable':
      return status >= 200 && status < 300;
    case 'denied':
      return status === 403;
    case 'rejected':
      return status === 400;
  }
}

async function run(smokeCase: SmokeCase): Promise<SmokeResult> {
  const { body, ...reported } = smokeCase;
  try {
    const response = await fetch(`${baseUrl}${smokeCase.path}`, {
      method: smokeCase.method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    const passed = isSatisfied(smokeCase.expect, response.status);

    logger[passed ? 'info' : 'error'](
      {
        name: smokeCase.name,
        method: smokeCase.method,
        path: smokeCase.path,
        status: response.status,
        expect: smokeCase.expect,
      },
      passed ? 'Caso del smoke satisfecho' : 'Caso del smoke INCUMPLIDO',
    );

    return { ...reported, status: response.status, passed, bodyPreview: text.slice(0, 1200) };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown network error';
    logger.error(
      { name: smokeCase.name, errorName: error instanceof Error ? error.name : 'UnknownError' },
      message,
    );
    return { ...reported, status: null, passed: false, error: message, bodyPreview: '' };
  }
}

function buildCases(): { cases: SmokeCase[]; skipped: string[] } {
  const cases: SmokeCase[] = [
    {
      name: 'plans:list',
      method: 'GET',
      path: '/portal/plans',
      expect: 'reachable',
      guards: 'El catálogo de planes responde y solo expone planes activos por defecto.',
    },
    {
      name: 'subscription:current',
      method: 'GET',
      path: '/portal/subscription',
      expect: 'reachable',
      guards: 'La suscripción se resuelve desde las membresías del usuario, sin recibir la cuenta.',
    },
    {
      name: 'branches:list',
      method: 'GET',
      path: '/portal/branches',
      expect: 'reachable',
      guards: 'Las sucursales se acotan al alcance del usuario.',
    },
    {
      name: 'billing:panel',
      method: 'GET',
      path: '/portal/billing',
      expect: 'reachable',
      guards:
        'El panel de facturación calcula totales sobre el universo completo, no sobre la página.',
    },
    {
      name: 'advertisers:list',
      method: 'GET',
      path: '/portal/advertisers',
      expect: 'reachable',
      guards:
        'Solo devuelve los anunciantes de las cuentas del usuario, con DTO sin datos sensibles.',
    },
    {
      name: 'plans:page-size-cap',
      method: 'GET',
      path: '/portal/plans?limit=1000',
      expect: 'rejected',
      guards: 'El tope duro de paginación se aplica en el schema, no en el servicio.',
    },
    {
      name: 'campaigns:advertiser-required',
      method: 'GET',
      path: '/portal/campaigns',
      expect: 'rejected',
      guards: 'El listado de campañas exige anunciante: no existe un listado global.',
    },
    {
      name: 'campaigns:status-enum',
      method: 'PATCH',
      path: `/portal/campaigns/${ANY_UUID}/status`,
      body: { status: 'ARCHIVED' },
      expect: 'rejected',
      guards: 'El comercio solo puede alternar ACTIVE/PAUSED; archivar es una operación interna.',
    },
  ];

  const skipped: string[] = [];
  const foreignAccountId = smokeEnv.ATLAS_PORTAL_SMOKE_FOREIGN_ACCOUNT_ID;
  const foreignAdvertiserId = smokeEnv.ATLAS_PORTAL_SMOKE_FOREIGN_ADVERTISER_ID;
  const foreignCampaignId = smokeEnv.ATLAS_PORTAL_SMOKE_FOREIGN_CAMPAIGN_ID;

  if (foreignAccountId) {
    cases.push(
      {
        name: 'scope:foreign-account-billing',
        method: 'GET',
        path: `/portal/billing?merchantAccountId=${foreignAccountId}`,
        expect: 'denied',
        guards: 'BOLA: la facturación de otro comercio no puede leerse enviando su identificador.',
      },
      {
        name: 'scope:foreign-account-branches',
        method: 'GET',
        path: `/portal/branches?accountId=${foreignAccountId}`,
        expect: 'denied',
        guards: 'BOLA: las sucursales de otro comercio no pueden listarse.',
      },
    );
  } else {
    skipped.push('ATLAS_PORTAL_SMOKE_FOREIGN_ACCOUNT_ID');
  }

  if (foreignAdvertiserId) {
    cases.push({
      name: 'scope:foreign-advertiser-campaigns',
      method: 'GET',
      path: `/portal/campaigns?advertiserId=${foreignAdvertiserId}`,
      expect: 'denied',
      guards: 'BOLA: las campañas de un anunciante ajeno no pueden listarse.',
    });
  } else {
    skipped.push('ATLAS_PORTAL_SMOKE_FOREIGN_ADVERTISER_ID');
  }

  if (foreignCampaignId) {
    cases.push({
      name: 'scope:foreign-campaign-toggle',
      method: 'PATCH',
      path: `/portal/campaigns/${foreignCampaignId}/status`,
      body: { status: 'PAUSED', reason: 'smoke de alcance cruzado del portal' },
      expect: 'denied',
      guards: 'BOLA en mutación: no se puede apagar la campaña de otro comercio.',
    });
  } else {
    skipped.push('ATLAS_PORTAL_SMOKE_FOREIGN_CAMPAIGN_ID');
  }

  return { cases, skipped };
}

async function main(): Promise<void> {
  const health = await run({
    name: 'health',
    method: 'GET',
    path: '/health',
    expect: 'reachable',
    guards: 'El servicio está arriba.',
  });
  // `/health` es público: no se le aplica la regla de "sin token, 401".
  health.passed = health.status !== null && health.status >= 200 && health.status < 300;

  const { cases, skipped } = buildCases();
  const results = [health];
  for (const smokeCase of cases) {
    results.push(await run(smokeCase));
  }

  const passed = results.every((result) => result.passed);
  const report = {
    executedAt: new Date().toISOString(),
    baseUrl,
    tokenProvided: Boolean(token),
    // Sin token el smoke solo prueba que el portal es fail-closed; los casos de alcance cruzado
    // y de validación necesitan un JWT de un usuario de comercio real.
    mode: token ? 'authorized' : 'fail-closed-only',
    skippedForMissingEnv: skipped,
    passed,
    results,
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  logger.info({ reportPath, passed, mode: report.mode, skipped }, 'Reporte del smoke escrito');

  if (!passed) {
    process.exitCode = 1;
  }
}

void main();
