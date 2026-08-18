import { readdirSync, readFileSync } from 'fs';
import { basename, join } from 'path';
import { Client } from 'pg';
import { env } from '../../src/config/env';
import { resolveDbSslOptions } from '../../src/config/db-ssl';
import { PinoLoggerService } from '../../src/common/logger/pino-logger.service';

type MigrationDirection = 'up' | 'down' | 'status';

interface MigrationFile {
  version: string;
  path: string;
  name: string;
}

const migrationsDir = join(process.cwd(), 'src/database/migrations');
const logger = new PinoLoggerService();

async function main(): Promise<void> {
  const direction = parseDirection(process.argv[2]);
  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: resolveDbSslOptions(env),
  });

  await client.connect();
  try {
    await ensureMigrationTable(client);

    if (direction === 'status') {
      await printStatus(client);
      return;
    }

    if (direction === 'up') {
      await migrateUp(client);
      return;
    }

    await rollbackLast(client);
  } finally {
    await client.end();
  }
}

function parseDirection(value: string | undefined): MigrationDirection {
  if (!value || value === 'up') return 'up';
  if (value === 'down' || value === 'rollback') return 'down';
  if (value === 'status') return 'status';
  throw new Error('Uso: tsx scripts/db/migrate.ts [up|down|status]');
}

async function ensureMigrationTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS atlas_accounting_migrations (
      version varchar(120) PRIMARY KEY,
      name varchar(240) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

function readMigrationFiles(suffix: '.up.sql' | '.down.sql'): MigrationFile[] {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(suffix))
    .sort()
    .map((file) => ({
      version: file.replace(suffix, ''),
      name: basename(file),
      path: join(migrationsDir, file),
    }));
}

async function getAppliedVersions(client: Client): Promise<Set<string>> {
  const result = await client.query<{ version: string }>(
    'SELECT version FROM atlas_accounting_migrations ORDER BY version ASC',
  );
  return new Set(result.rows.map((row) => row.version));
}

async function migrateUp(client: Client): Promise<void> {
  const appliedVersions = await getAppliedVersions(client);
  const pending = readMigrationFiles('.up.sql').filter(
    (migration) => !appliedVersions.has(migration.version),
  );

  if (pending.length === 0) {
    logger.info('No hay migraciones pendientes.', {
      layer: 'script',
      script: 'migrate',
      direction: 'up',
    });
    return;
  }

  for (const migration of pending) {
    await client.query('BEGIN');
    try {
      await client.query(readFileSync(migration.path, 'utf8'));
      await client.query('INSERT INTO atlas_accounting_migrations(version, name) VALUES ($1, $2)', [
        migration.version,
        migration.name,
      ]);
      await client.query('COMMIT');
      logger.info('Migración aplicada.', {
        layer: 'script',
        script: 'migrate',
        migrationName: migration.name,
        version: migration.version,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
}

async function rollbackLast(client: Client): Promise<void> {
  const applied = await client.query<{ version: string; name: string }>(
    'SELECT version, name FROM atlas_accounting_migrations ORDER BY version DESC LIMIT 1',
  );

  const last = applied.rows[0];
  if (!last) {
    logger.info('No hay migraciones aplicadas para revertir.', {
      layer: 'script',
      script: 'migrate',
      direction: 'down',
    });
    return;
  }

  const downPath = join(migrationsDir, `${last.version}.down.sql`);
  await client.query('BEGIN');
  try {
    await client.query(readFileSync(downPath, 'utf8'));
    await client.query('DELETE FROM atlas_accounting_migrations WHERE version = $1', [
      last.version,
    ]);
    await client.query('COMMIT');
    logger.warn('Migración revertida.', {
      layer: 'script',
      script: 'migrate',
      version: last.version,
      name: last.name,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function printStatus(client: Client): Promise<void> {
  const appliedVersions = await getAppliedVersions(client);
  for (const migration of readMigrationFiles('.up.sql')) {
    const status = appliedVersions.has(migration.version) ? 'APPLIED' : 'PENDING';
    logger.info('Estado de migración.', {
      layer: 'script',
      script: 'migrate',
      status,
      migrationName: migration.name,
      version: migration.version,
    });
  }
}

main().catch((error) => {
  logger.error('Fallo ejecutando migraciones.', { layer: 'script', script: 'migrate', error });
  process.exitCode = 1;
});
