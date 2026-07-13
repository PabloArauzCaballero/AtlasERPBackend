import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { relative, resolve } from 'path';
import { Client } from 'pg';
import { env } from '../../src/config/env';
import { PinoLoggerService } from '../../src/common/logger/pino-logger.service';

const logger = new PinoLoggerService();

interface AppliedSqlFile {
  checksum: string;
}

interface LegacyProbe {
  filePath: string;
  sql: string;
}

const legacyProbes: LegacyProbe[] = [
  {
    filePath: 'src/database/sql/accounting/001_schema_atlas_accounting.sql',
    sql: "SELECT to_regclass('atlas_accounting.legal_entity') IS NOT NULL AS exists",
  },
  {
    filePath: 'src/database/sql/accounting/002_hardening_atlas_accounting.sql',
    sql: `
      SELECT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_accounting_period_close_status'
          AND conrelid = 'atlas_accounting.accounting_period'::regclass
      ) AS exists
    `,
  },
  {
    filePath: 'src/database/migrations/20260708203000-create-atlas-ads-schema.sql',
    sql: "SELECT to_regclass('public.ad_advertiser_accounts') IS NOT NULL AS exists",
  },
  {
    filePath: 'src/database/migrations/20260709010000-create-business-action-logs.sql',
    sql: "SELECT to_regclass('atlas_audit.business_action_logs') IS NOT NULL AS exists",
  },
];

async function main(): Promise<void> {
  const filePaths = process.argv.slice(2);

  if (filePaths.length === 0) {
    throw new Error('Uso: tsx scripts/db/run-sql.ts <archivo.sql> [archivo2.sql]');
  }

  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: env.DB_SSL ? { rejectUnauthorized: false } : undefined,
  });

  logger.info('Conectando a PostgreSQL para ejecutar SQL.', {
    layer: 'script',
    script: 'run-sql',
    fileCount: filePaths.length,
  });
  await client.connect();

  try {
    await ensureSqlMigrationTable(client);

    for (const filePath of filePaths) {
      const absoluteFilePath = resolve(filePath);
      const migrationKey = normalizeMigrationPath(absoluteFilePath);
      const sql = readFileSync(absoluteFilePath, 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const applied = await getAppliedSqlFile(client, migrationKey);

      if (applied) {
        if (applied.checksum !== checksum) {
          throw new Error(`El SQL ya aplicado cambió de contenido: ${migrationKey}`);
        }

        logger.info('SQL omitido porque ya fue aplicado.', {
          layer: 'script',
          script: 'run-sql',
          filePath: migrationKey,
        });
        continue;
      }

      if (await wasLegacySqlAlreadyApplied(client, migrationKey)) {
        await markSqlFileApplied(client, migrationKey, checksum);
        logger.info('SQL omitido porque la base ya contiene sus objetos.', {
          layer: 'script',
          script: 'run-sql',
          filePath: migrationKey,
        });
        continue;
      }

      await client.query(sql);
      await markSqlFileApplied(client, migrationKey, checksum);
      logger.info('SQL ejecutado correctamente.', {
        layer: 'script',
        script: 'run-sql',
        filePath: migrationKey,
      });
    }
  } finally {
    await client.end();
    logger.info('Conexión PostgreSQL cerrada tras ejecución SQL.', {
      layer: 'script',
      script: 'run-sql',
    });
  }
}

async function ensureSqlMigrationTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.atlas_sql_migrations (
      file_path text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

function normalizeMigrationPath(filePath: string): string {
  return relative(process.cwd(), filePath).replace(/\\/g, '/');
}

async function getAppliedSqlFile(
  client: Client,
  filePath: string,
): Promise<AppliedSqlFile | undefined> {
  const result = await client.query<AppliedSqlFile>(
    'SELECT checksum FROM public.atlas_sql_migrations WHERE file_path = $1',
    [filePath],
  );
  return result.rows[0];
}

async function wasLegacySqlAlreadyApplied(client: Client, filePath: string): Promise<boolean> {
  const probe = legacyProbes.find((candidate) => candidate.filePath === filePath);
  if (!probe) return false;

  const result = await client.query<{ exists: boolean }>(probe.sql);
  return result.rows[0]?.exists === true;
}

async function markSqlFileApplied(
  client: Client,
  filePath: string,
  checksum: string,
): Promise<void> {
  await client.query(
    `
      INSERT INTO public.atlas_sql_migrations(file_path, checksum)
      VALUES ($1, $2)
      ON CONFLICT (file_path) DO NOTHING
    `,
    [filePath, checksum],
  );
}

main().catch((error) => {
  logger.error('Fallo ejecutando SQL.', { layer: 'script', script: 'run-sql', error });
  process.exitCode = 1;
});
