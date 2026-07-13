import 'dotenv/config';
import { JwtService } from '@nestjs/jwt';
import pino from 'pino';

const logger = pino({
  name: 'atlas-b2b-crm-ventas-smoke',
  level: process.env.LOG_LEVEL ?? 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: ['headers.authorization', '*.token'],
});

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1';
const JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? 'change_me_long_random_secret_32_chars_min';

const jwt = new JwtService({ secret: JWT_ACCESS_SECRET });
const token = jwt.sign(
  { sub: '00000000-0000-0000-0000-000000000001', roleCode: 'ADMIN' },
  { expiresIn: '15m' },
);

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const method = init?.method ?? 'GET';
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));

  logger.info({ method, path, statusCode: response.status }, 'Smoke request completed');

  if (!response.ok) {
    logger.error(
      { method, path, statusCode: response.status, responseBody: body },
      'Smoke request failed',
    );
    throw new Error(`Smoke failed for ${path}`);
  }

  return body;
}

async function main(): Promise<void> {
  logger.info({ apiBaseUrl: API_BASE_URL }, 'Starting B2B CRM smoke test');
  await request('/health', { headers: {} });
  await request('/ready', { headers: {} });
  await request('/b2b/accounts?limit=5');
  logger.info('B2B CRM smoke test completed');
}

void main().catch((error: unknown) => {
  logger.error(
    { errorName: error instanceof Error ? error.name : 'UnknownError' },
    error instanceof Error ? error.message : 'B2B CRM smoke test failed',
  );
  process.exit(1);
});
