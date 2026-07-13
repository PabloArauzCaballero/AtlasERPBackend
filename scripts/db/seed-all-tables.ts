import { Client } from 'pg';
import { env } from '../../src/config/env';
import { PinoLoggerService } from '../../src/common/logger/pino-logger.service';
import { SeedCatalogRepository } from './seed-catalog.repository';
import type { SeedTable, SeedTableMetadata } from './seed-catalog.types';
import { resolveSeedValue } from './seed-value-resolver';

const logger = new PinoLoggerService();
const maxPasses = 12;

interface SeedFailure {
  table: SeedTable;
  reason: string;
}

async function main(): Promise<void> {
  assertDemoSeedAllowed();
  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: env.DB_SSL ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  const catalog = new SeedCatalogRepository(client);

  try {
    await client.query('BEGIN');
    const tables = await catalog.listTables();
    const result = await seedEmptyTables(catalog, tables);
    if (result.failures.length > 0) throw buildCoverageError(result.failures);
    await client.query('COMMIT');
    logger.info('Seed de cobertura completado.', {
      layer: 'script',
      script: 'seed-all-tables',
      discoveredTables: tables.length,
      insertedTables: result.inserted,
      prePopulatedTables: result.prePopulated,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

async function seedEmptyTables(
  catalog: SeedCatalogRepository,
  tables: SeedTable[],
): Promise<{ inserted: number; prePopulated: number; failures: SeedFailure[] }> {
  const pending: SeedTable[] = [];
  let prePopulated = 0;
  for (const table of tables) {
    if ((await catalog.countRows(table)) > 0) prePopulated += 1;
    else pending.push(table);
  }

  let inserted = 0;
  let failures: SeedFailure[] = pending.map((table) => ({ table, reason: 'No procesada' }));
  for (let pass = 1; pass <= maxPasses && failures.length > 0; pass += 1) {
    const retry: SeedFailure[] = [];
    for (const candidate of failures) {
      try {
        const metadata = await catalog.getMetadata(candidate.table);
        const values = await buildValues(catalog, metadata);
        await catalog.insert(candidate.table, values);
        inserted += 1;
      } catch (error) {
        retry.push({ table: candidate.table, reason: errorMessage(error) });
      }
    }
    if (retry.length === failures.length && pass > 1) break;
    failures = retry;
  }
  return { inserted, prePopulated, failures };
}

async function buildValues(
  catalog: SeedCatalogRepository,
  table: SeedTableMetadata,
): Promise<Record<string, unknown>> {
  const values: Record<string, unknown> = {};
  for (const column of table.columns) {
    if (column.isIdentity || column.isGenerated || column.hasDefault) continue;

    const reference = table.foreignKeys.find((item) => item.columnName === column.columnName);
    if (reference) {
      const value = await catalog.getFirstReferencedValue(reference);
      if (value !== undefined) values[column.columnName] = value;
      else if (!column.isNullable) throw new Error(`FK sin fila padre: ${reference.targetSchema}.${reference.targetTable}`);
      continue;
    }
    if (column.isNullable) continue;

    const enumValue = column.dataType === 'USER-DEFINED'
      ? await catalog.getFirstEnumValue(column)
      : undefined;
    const value = enumValue ?? resolveSeedValue(table.tableName, column, table.checkDefinitions);
    if (value === undefined) throw new Error(`Sin valor seed para ${column.columnName} (${column.udtName})`);
    values[column.columnName] = value;
  }
  return values;
}

function assertDemoSeedAllowed(): void {
  if (process.env.ALLOW_DEMO_SEEDS !== 'true') {
    throw new Error('Seed bloqueado. Defina ALLOW_DEMO_SEEDS=true exclusivamente en un entorno controlado.');
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('El seed de cobertura no puede ejecutarse con NODE_ENV=production.');
  }
}

function buildCoverageError(failures: SeedFailure[]): Error {
  const details = failures
    .map(({ table, reason }) => `- ${table.schemaName}.${table.tableName}: ${reason}`)
    .join('\n');
  return new Error(`No fue posible poblar ${failures.length} tablas:\n${details}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error) => {
  logger.error('Falló el seed de cobertura.', { layer: 'script', script: 'seed-all-tables', error });
  process.exitCode = 1;
});
