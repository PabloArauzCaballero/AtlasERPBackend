import type { Client } from 'pg';
import type {
  ForeignKeyReference,
  SeedColumn,
  SeedTable,
  SeedTableMetadata,
} from './seed-catalog.types';

const managedSchemas = ['public', 'atlas_sales', 'atlas_accounting', 'atlas_audit'];

export class SeedCatalogRepository {
  constructor(private readonly client: Client) {}

  async listTables(): Promise<SeedTable[]> {
    const result = await this.client.query<SeedTable>(`
      SELECT table_schema AS "schemaName", table_name AS "tableName"
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema = ANY($1)
        AND table_name NOT IN ('atlas_sql_migrations', 'SequelizeMeta')
      ORDER BY table_schema, table_name
    `, [managedSchemas]);
    return result.rows;
  }

  async getMetadata(table: SeedTable): Promise<SeedTableMetadata> {
    const [columns, foreignKeys, checks] = await Promise.all([
      this.getColumns(table),
      this.getForeignKeys(table),
      this.getChecks(table),
    ]);
    return { ...table, columns, foreignKeys, checkDefinitions: checks };
  }

  async countRows(table: SeedTable): Promise<number> {
    const result = await this.client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${quote(table.schemaName)}.${quote(table.tableName)}`,
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async getFirstReferencedValue(reference: ForeignKeyReference): Promise<unknown> {
    const result = await this.client.query<{ value: unknown }>(`
      SELECT ${quote(reference.targetColumn)} AS value
      FROM ${quote(reference.targetSchema)}.${quote(reference.targetTable)}
      ORDER BY ${quote(reference.targetColumn)}
      LIMIT 1
    `);
    return result.rows[0]?.value;
  }

  async getFirstEnumValue(column: SeedColumn): Promise<string | undefined> {
    const result = await this.client.query<{ value: string }>(`
      SELECT enumlabel AS value
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = $1 AND t.typname = $2
      ORDER BY enumsortorder
      LIMIT 1
    `, [column.udtSchema, column.udtName]);
    return result.rows[0]?.value;
  }

  async insert(table: SeedTable, values: Readonly<Record<string, unknown>>): Promise<void> {
    const entries = Object.entries(values);
    if (entries.length === 0) {
      await this.client.query(`INSERT INTO ${quote(table.schemaName)}.${quote(table.tableName)} DEFAULT VALUES`);
      return;
    }
    const columns = entries.map(([name]) => quote(name)).join(', ');
    const placeholders = entries.map((_, index) => `$${index + 1}`).join(', ');
    await this.client.query(
      `INSERT INTO ${quote(table.schemaName)}.${quote(table.tableName)} (${columns}) VALUES (${placeholders})`,
      entries.map(([, value]) => value),
    );
  }

  private async getColumns(table: SeedTable): Promise<SeedColumn[]> {
    const result = await this.client.query<SeedColumn>(`
      SELECT column_name AS "columnName", data_type AS "dataType",
        udt_schema AS "udtSchema", udt_name AS "udtName",
        is_nullable = 'YES' AS "isNullable",
        column_default IS NOT NULL AS "hasDefault",
        is_identity = 'YES' AS "isIdentity",
        is_generated <> 'NEVER' AS "isGenerated"
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `, [table.schemaName, table.tableName]);
    return result.rows;
  }

  private async getForeignKeys(table: SeedTable): Promise<ForeignKeyReference[]> {
    const result = await this.client.query<ForeignKeyReference>(`
      SELECT a.attname AS "columnName", fn.nspname AS "targetSchema",
        fc.relname AS "targetTable", fa.attname AS "targetColumn"
      FROM pg_constraint c
      JOIN pg_class tc ON tc.oid = c.conrelid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      JOIN pg_class fc ON fc.oid = c.confrelid
      JOIN pg_namespace fn ON fn.oid = fc.relnamespace
      JOIN LATERAL unnest(c.conkey, c.confkey) AS keys(attnum, fattnum) ON true
      JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = keys.attnum
      JOIN pg_attribute fa ON fa.attrelid = fc.oid AND fa.attnum = keys.fattnum
      WHERE c.contype = 'f' AND tn.nspname = $1 AND tc.relname = $2
    `, [table.schemaName, table.tableName]);
    return result.rows;
  }

  private async getChecks(table: SeedTable): Promise<string[]> {
    const result = await this.client.query<{ definition: string }>(`
      SELECT pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE c.contype = 'c' AND n.nspname = $1 AND t.relname = $2
    `, [table.schemaName, table.tableName]);
    return result.rows.map((row) => row.definition);
  }
}

function quote(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}
