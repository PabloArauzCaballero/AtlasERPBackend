/**
 * Base PostgreSQL REAL y recién migrada para las pruebas de integración de cobertura.
 *
 * Cada archivo de prueba crea su propia base (`cov_<aleatorio>`) en el servidor que indica
 * `ERP_INTEGRATION_DATABASE_URL`, le aplica la lista canónica de migraciones
 * (`STARTUP_MIGRATION_FILES`, la misma que usa el arranque) con el mismo `search_path`, y la borra
 * al terminar. Así la prueba ve el esquema desplegado —CHECK, índices únicos, disparadores— y no un
 * `sync()` de Sequelize que no los tiene.
 *
 * Sin la variable, la suite se SALTA y lo dice por consola: una prueba saltada no es una prueba
 * aprobada, y el evaluador de cumplimiento sólo cuenta las aprobadas. Con
 * `ERP_INTEGRATION_REQUIRED=1` (lo que debe fijar CI) la ausencia de base es un FALLO, no un salto.
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import {
  MIGRATION_SEARCH_PATH,
  STARTUP_MIGRATION_FILES,
} from '../../src/database/startup-migrations';

export const INTEGRATION_DATABASE_URL = process.env.ERP_INTEGRATION_DATABASE_URL ?? '';
const REQUIRED = process.env.ERP_INTEGRATION_REQUIRED === '1';

if (!INTEGRATION_DATABASE_URL) {
  if (REQUIRED) {
    throw new Error(
      'ERP_INTEGRATION_REQUIRED=1 pero falta ERP_INTEGRATION_DATABASE_URL: la prueba de integración no puede saltarse.',
    );
  }
  console.warn(
    '⚠️  ERP_INTEGRATION_DATABASE_URL no definida: se SALTAN las pruebas de integración de cobertura.',
  );
}

/** `describe` que se salta, visiblemente, cuando no hay base de integración. */
export const describeWithDatabase: jest.Describe = INTEGRATION_DATABASE_URL
  ? describe
  : describe.skip;

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

export interface MigratedDatabase {
  url: string;
  drop: () => Promise<void>;
}

export async function createMigratedDatabase(prefix: string): Promise<MigratedDatabase> {
  const name = `${prefix}_${randomBytes(5).toString('hex')}`;
  const admin = new Client({ connectionString: INTEGRATION_DATABASE_URL });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }

  const url = withDatabase(INTEGRATION_DATABASE_URL, name);
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const file of STARTUP_MIGRATION_FILES) {
      const sql = readFileSync(resolve(file), 'utf8');
      await client.query(`SET search_path TO ${MIGRATION_SEARCH_PATH}`);
      try {
        await client.query(sql);
      } catch (error) {
        throw new Error(
          `La migración ${file} falló en la base de integración: ${(error as Error).message}`,
        );
      }
    }
  } finally {
    await client.end();
  }

  return {
    url,
    drop: async () => {
      const cleaner = new Client({ connectionString: INTEGRATION_DATABASE_URL });
      await cleaner.connect();
      try {
        await cleaner.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } finally {
        await cleaner.end();
      }
    },
  };
}
