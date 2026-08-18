import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';
import { Client } from 'pg';
import { env } from '../../src/config/env';
import { resolveDbSslOptions } from '../../src/config/db-ssl';
import { PinoLoggerService } from '../../src/common/logger/pino-logger.service';

const logger = new PinoLoggerService();

const PACKAGE_DIR = 'src/database/seeders/official';
const SEEDS_FILE = `${PACKAGE_DIR}/atlas_official_bootstrap_seeds.json`;
const CONTRACT_FILE = `${PACKAGE_DIR}/06_import_contract.json`;
const REPORT_FILE = `${PACKAGE_DIR}/99_validation_report.json`;

type SeedRow = Record<string, unknown>;

interface SeedPackage {
  metadata: { package_name: string; version: string };
  seed_order: string[];
  database_seeds: Record<string, SeedRow[]>;
  cleanup_candidates_from_current_dump: {
    table?: string;
    natural_key?: Record<string, unknown>;
    reason: string;
  }[];
}

interface ImportContract {
  recommended_conflict_keys: Record<string, string[]>;
}

interface ValidationReport {
  status: string;
  sha256: string;
  database_seed_record_count: number;
}

// Las columnas FK del paquete apuntan a UUIDv5 deterministas. Si la fila padre ya existe
// en la base con otro id (p. ej. un plan de cuentas creado antes de esta semilla), hay que
// reescribir la referencia al id real; si no, el INSERT viola la FK.
const FOREIGN_KEYS: Record<string, Record<string, string>> = {
  'atlas_accounting.ledger': { legal_entity_id: 'atlas_accounting.legal_entity' },
  'atlas_accounting.fiscal_year': { legal_entity_id: 'atlas_accounting.legal_entity' },
  'atlas_accounting.accounting_period': { fiscal_year_id: 'atlas_accounting.fiscal_year' },
  'atlas_accounting.branch': { legal_entity_id: 'atlas_accounting.legal_entity' },
  'atlas_accounting.cost_center': {
    legal_entity_id: 'atlas_accounting.legal_entity',
    manager_bp_id: 'atlas_accounting.business_partner',
  },
  'atlas_accounting.profit_center': { legal_entity_id: 'atlas_accounting.legal_entity' },
  'atlas_accounting.business_partner_role': {
    business_partner_id: 'atlas_accounting.business_partner',
    legal_entity_id: 'atlas_accounting.legal_entity',
  },
  'atlas_accounting.gl_account': {
    coa_id: 'atlas_accounting.chart_of_accounts',
    parent_account_id: 'atlas_accounting.gl_account',
  },
  'atlas_accounting.tax_code': {
    output_gl_account_id: 'atlas_accounting.gl_account',
    input_gl_account_id: 'atlas_accounting.gl_account',
  },
};

// El contrato oficial no propone clave natural para estas dos tablas porque el esquema no
// tiene índice único; se resuelven por SELECT para no duplicar filas ya sembradas.
const EXTRA_CONFLICT_KEYS: Record<string, string[]> = {
  'atlas_sales.territories': ['name'],
  'public.ad_target_segments': ['name'],
};

interface TableStats {
  inserted: number;
  updated: number;
  remapped: number;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  const raw = readFileSync(resolve(SEEDS_FILE), 'utf8');
  const report = JSON.parse(readFileSync(resolve(REPORT_FILE), 'utf8')) as ValidationReport;
  const contract = JSON.parse(readFileSync(resolve(CONTRACT_FILE), 'utf8')) as ImportContract;
  const seeds = JSON.parse(raw) as SeedPackage;

  const checksum = createHash('sha256').update(raw).digest('hex');
  if (checksum !== report.sha256) {
    throw new Error(
      `El paquete de semillas no coincide con su reporte de validación (sha256 ${checksum}).`,
    );
  }
  if (report.status !== 'PASS') {
    throw new Error(`El reporte de validación del paquete no está en PASS: ${report.status}.`);
  }

  const conflictKeys: Record<string, string[]> = {
    ...contract.recommended_conflict_keys,
    ...EXTRA_CONFLICT_KEYS,
  };

  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: resolveDbSslOptions(env),
  });
  await client.connect();

  const stats: Record<string, TableStats> = {};
  // Mapa id-del-paquete -> id real en base. Se llena tabla por tabla en seed_order, así que
  // cuando una tabla hija se procesa sus padres ya están resueltos.
  const idMap = new Map<string, string>();

  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('atlas:official-seeds:v1'))");

    for (const table of seeds.seed_order) {
      const rows = seeds.database_seeds[table];
      const key = conflictKeys[table];
      if (!rows) throw new Error(`El paquete no trae filas para ${table}.`);
      if (!key) throw new Error(`Sin clave natural definida para ${table}.`);

      const jsonbColumns = await getJsonbColumns(client, table);
      const tableStats: TableStats = { inserted: 0, updated: 0, remapped: 0 };

      for (const seedRow of rows) {
        const row = { ...seedRow };
        const packageId = row.id as string;

        for (const [column, parentTable] of Object.entries(FOREIGN_KEYS[table] ?? {})) {
          const reference = row[column];
          if (typeof reference === 'string') {
            const resolved = idMap.get(reference);
            if (!resolved) {
              throw new Error(`FK sin resolver: ${table}.${column} -> ${parentTable} (${reference}).`);
            }
            if (resolved !== reference) tableStats.remapped++;
            row[column] = resolved;
          }
        }

        const existingId = await findByNaturalKey(client, table, key, row);
        if (existingId) row.id = existingId;
        idMap.set(packageId, row.id as string);

        const inserted = await upsertById(client, table, row, jsonbColumns);
        if (inserted) tableStats.inserted++;
        else tableStats.updated++;
      }

      stats[table] = tableStats;
      logger.info('Tabla sembrada.', {
        layer: 'script',
        script: 'import-official-seeds',
        table,
        ...tableStats,
      });
    }

    await reportCleanupCandidates(client, seeds);

    if (dryRun) {
      await client.query('ROLLBACK');
      logger.warn('Dry-run: la transacción fue revertida, no se persistió nada.', {
        layer: 'script',
        script: 'import-official-seeds',
      });
    } else {
      await client.query('COMMIT');
    }

    const totals = Object.values(stats).reduce(
      (acc, s) => ({
        inserted: acc.inserted + s.inserted,
        updated: acc.updated + s.updated,
        remapped: acc.remapped + s.remapped,
      }),
      { inserted: 0, updated: 0, remapped: 0 },
    );
    logger.info('Semillas oficiales aplicadas.', {
      layer: 'script',
      script: 'import-official-seeds',
      packageVersion: seeds.metadata.version,
      expectedRecords: report.database_seed_record_count,
      dryRun,
      ...totals,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

async function getJsonbColumns(client: Client, table: string): Promise<Set<string>> {
  const [schema, name] = table.split('.');
  const result = await client.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2 AND udt_name = 'jsonb'`,
    [schema, name],
  );
  return new Set(result.rows.map((r) => r.column_name));
}

async function findByNaturalKey(
  client: Client,
  table: string,
  key: string[],
  row: SeedRow,
): Promise<string | undefined> {
  const where = key.map((column, index) => `${column} = $${index + 1}`).join(' AND ');
  const result = await client.query<{ id: string }>(
    `SELECT id FROM ${table} WHERE ${where}`,
    key.map((column) => row[column]),
  );
  if (result.rows.length > 1) {
    throw new Error(`Clave natural ambigua en ${table}: ${key.join(', ')} devuelve varias filas.`);
  }
  return result.rows[0]?.id;
}

// `xmax = 0` distingue la fila recién insertada de la actualizada por el ON CONFLICT.
async function upsertById(
  client: Client,
  table: string,
  row: SeedRow,
  jsonbColumns: Set<string>,
): Promise<boolean> {
  const columns = Object.keys(row);
  const values = columns.map((column) => {
    const value = row[column];
    return jsonbColumns.has(column) && value !== null ? JSON.stringify(value) : value;
  });
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  const updates = columns
    .filter((column) => column !== 'id')
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(', ');

  const result = await client.query<{ inserted: boolean }>(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})
     ON CONFLICT (id) DO UPDATE SET ${updates}
     RETURNING (xmax = 0) AS inserted`,
    values,
  );
  return result.rows[0]?.inserted === true;
}

async function reportCleanupCandidates(client: Client, seeds: SeedPackage): Promise<void> {
  for (const candidate of seeds.cleanup_candidates_from_current_dump) {
    if (!candidate.table || !candidate.natural_key) continue;
    const key = Object.keys(candidate.natural_key);
    const where = key.map((column, index) => `${column} = $${index + 1}`).join(' AND ');
    const result = await client.query(
      `SELECT id FROM ${candidate.table} WHERE ${where}`,
      key.map((column) => candidate.natural_key?.[column]),
    );
    if (result.rowCount) {
      logger.warn('Fila de prueba detectada; el paquete recomienda eliminarla manualmente.', {
        layer: 'script',
        script: 'import-official-seeds',
        table: candidate.table,
        naturalKey: candidate.natural_key,
        reason: candidate.reason,
      });
    }
  }
}

main().catch((error) => {
  logger.error('Fallo importando semillas oficiales.', {
    layer: 'script',
    script: 'import-official-seeds',
    error,
  });
  process.exitCode = 1;
});
