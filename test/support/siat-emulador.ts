/**
 * El emulador REAL del SIN (proveedor `siat` de `AtlasExternalProvidersMock`) para las pruebas de
 * integración fiscales: se arranca como proceso aparte en un puerto libre.
 *
 * Se busca en `ERP_PROVIDERS_MOCK_DIR` (por defecto `../AtlasExternalProvidersMock`). Sin él las
 * suites se SALTAN avisándolo; con `ERP_REQUIRE_PROVIDERS_MOCK=1` (CI con el secreto) es un FALLO.
 */
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { describeWithDatabase } from './coverage-integration-db';

const MOCK_DIR = resolve(process.env.ERP_PROVIDERS_MOCK_DIR ?? '../AtlasExternalProvidersMock');
const MOCK_SERVER = resolve(MOCK_DIR, 'src/server.mjs');
const MOCK_HAS_SIAT = existsSync(resolve(MOCK_DIR, 'src/providers/siat.mjs'));

if (!MOCK_HAS_SIAT) {
  if (process.env.ERP_REQUIRE_PROVIDERS_MOCK === '1') {
    throw new Error(
      `ERP_REQUIRE_PROVIDERS_MOCK=1 pero no hay emulador SIAT en ${MOCK_DIR}: la prueba no puede saltarse.`,
    );
  }
  console.warn(`⚠️  No hay emulador SIAT en ${MOCK_DIR}: se SALTA la integración ERP ↔ SIAT.`);
}

export const describeWithMock = MOCK_HAS_SIAT ? describeWithDatabase : describe.skip;

export const ADMIN = {
  sub: '11111111-1111-4111-8111-111111111111',
  role: 'admin',
  roles: ['admin'],
};
export const silentLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  infoContext: jest.fn(),
  debugContext: jest.fn(),
  warnContext: jest.fn(),
  errorContext: jest.fn(),
};

export function puertoLibre(): Promise<number> {
  return new Promise((ok, mal) => {
    const server = createServer();
    server.once('error', mal);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => ok(port));
    });
  });
}

export async function arrancarEmulador(): Promise<{ url: string; proceso: ChildProcess }> {
  const port = await puertoLibre();
  const proceso = spawn(process.execPath, [MOCK_SERVER], {
    env: {
      ...process.env,
      MOCK_PROVIDERS_PORT: String(port),
      MOCK_PROVIDERS_DEFAULT_LATENCY_MS: '0',
      MOCK_PROVIDERS_MAX_LATENCY_MS: '0',
      MOCK_PROVIDERS_MAX_BODY_BYTES: String(2 * 1024 * 1024),
    },
    stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${port}`;
  for (let intento = 0; intento < 100; intento += 1) {
    try {
      if ((await fetch(`${url}/mock/live`)).ok) return { url, proceso };
    } catch {
      /* todavía arrancando */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  proceso.kill();
  throw new Error('El emulador no arrancó en 10 s.');
}
