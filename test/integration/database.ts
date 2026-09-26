import { Client } from 'pg';

/**
 * Base de datos para pruebas de integración y E2E con PostgreSQL real.
 *
 * Regla: sin base, la prueba se SALTA en local y lo dice; en CI (`CI=true`) o con
 * `REQUIRE_INTEGRATION_DB=true` es un FALLO. Un salto silencioso en CI dejaría el gate en verde sin
 * haber tocado una tabla, que es justo lo que P-12 prohíbe («un test omitido no se presenta como
 * exitoso»). El evaluador de cumplimiento (`scripts/compliance/evaluate.ts`) tampoco cuenta un
 * salto como pasado.
 */
/**
 * Convención CANÓNICA (acordada con el orquestador el 2026-09-24):
 *   ERP_INTEGRATION_DATABASE_URL  base migrada con `yarn db:migrate:prod`
 *   ERP_INTEGRATION_REQUIRED=1    sin base es un fallo, no un salto
 * Se aceptan también, por compatibilidad con las otras suites de la rama:
 *   DATABASE_URL (si no es el defecto de `test/set-env.ts`, ver ATLAS_TEST_DATABASE_PROVIDED)
 *   REQUIRE_INTEGRATION_DB=true y CI=true como «obligatorio».
 */
export function integrationDatabaseUrl(): string | undefined {
  const canonical = process.env.ERP_INTEGRATION_DATABASE_URL?.trim();
  if (canonical) return canonical;
  // `test/set-env.ts` (suite e2e) pone un DATABASE_URL por defecto y anota si venía de fuera.
  if (process.env.ATLAS_TEST_DATABASE_PROVIDED === 'false') return undefined;
  const url = process.env.DATABASE_URL?.trim();
  return url ? url : undefined;
}

export function databaseIsRequired(): boolean {
  return (
    process.env.ERP_INTEGRATION_REQUIRED === '1' ||
    process.env.ERP_INTEGRATION_REQUIRED === 'true' ||
    process.env.REQUIRE_INTEGRATION_DB === 'true' ||
    process.env.CI === 'true'
  );
}

/**
 * `describe` que sólo corre con base real. Sin base: salto visible en local, fallo en CI.
 */
export function describeWithDatabase(name: string, body: (databaseUrl: string) => void): void {
  const url = integrationDatabaseUrl();
  if (url) {
    describe(name, () => body(url));
    return;
  }

  if (databaseIsRequired()) {
    describe(name, () => {
      it('requiere ERP_INTEGRATION_DATABASE_URL o DATABASE_URL (CI / ERP_INTEGRATION_REQUIRED)', () => {
        throw new Error(
          'Falta ERP_INTEGRATION_DATABASE_URL (o DATABASE_URL) y esta suite necesita PostgreSQL migrado. En CI esto es un fallo, no un salto.',
        );
      });
    });
    return;
  }

  console.warn(
    `[integración] SALTADA «${name}»: falta ERP_INTEGRATION_DATABASE_URL (PostgreSQL migrado).`,
  );
  describe.skip(`${name} [SALTADA: sin base de integración]`, () => body(''));
}

export async function connect(databaseUrl: string): Promise<Client> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  return client;
}

/** Ejecuta `work` y devuelve el error de PostgreSQL que produjo, o falla si no hubo error. */
export async function expectPgError(
  work: () => Promise<unknown>,
): Promise<{ message: string; code?: string; constraint?: string }> {
  try {
    await work();
  } catch (error) {
    const pgError = error as { message: string; code?: string; constraint?: string };
    return { message: pgError.message, code: pgError.code, constraint: pgError.constraint };
  }
  throw new Error('Se esperaba que PostgreSQL rechazara la operación y la aceptó.');
}

/** Sufijo corto y único para no chocar con datos de otras corridas sobre la misma base. */
export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}
