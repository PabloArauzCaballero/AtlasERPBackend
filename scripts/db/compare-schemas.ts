/**
 * Compara el ESQUEMA de dos bases PostgreSQL de Atlas ERP y falla si difieren.
 *
 * Existe para la ruta de actualización de P-12: una base migrada desde la versión previa y luego
 * hasta HEAD tiene que quedar igual que una base migrada desde cero en HEAD. Si difieren, una de
 * las dos rutas —la que usa un despliegue existente o la de una instalación nueva— produce otra
 * base, y eso sólo se vería cuando dos entornos compartieran datos.
 *
 * Compara una huella del catálogo, no un `pg_dump`: columnas (tipo, nulabilidad, defecto),
 * restricciones, índices, triggers y cuerpos de funciones de los schemas de Atlas. El orden físico
 * de las columnas no cuenta (un `ALTER TABLE ADD COLUMN` en otra posición no cambia el contrato).
 *
 * Uso: tsx scripts/db/compare-schemas.ts <url-A> <url-B>
 */
import { Client } from 'pg';

const SCHEMAS = ['atlas_accounting', 'atlas_sales', 'atlas_audit', 'public'];

const QUERIES: Record<string, string> = {
  columns: `
    SELECT table_schema || '.' || table_name || '.' || column_name || ' ' || data_type ||
           COALESCE('(' || character_maximum_length || ')', '') ||
           COALESCE('(' || numeric_precision || ',' || numeric_scale || ')', '') ||
           ' null=' || is_nullable || ' default=' || COALESCE(column_default, '-') AS item
      FROM information_schema.columns
     WHERE table_schema = ANY($1)`,
  constraints: `
    SELECT n.nspname || '.' || c.relname || ' ' || con.conname || ' ' || pg_get_constraintdef(con.oid) AS item
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ANY($1)`,
  indexes: `
    SELECT schemaname || ' ' || indexdef AS item FROM pg_indexes WHERE schemaname = ANY($1)`,
  triggers: `
    SELECT n.nspname || '.' || c.relname || ' ' || pg_get_triggerdef(t.oid) AS item
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT t.tgisinternal AND n.nspname = ANY($1)`,
  functions: `
    SELECT n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') md5=' || md5(p.prosrc) AS item
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = ANY($1) AND p.prokind = 'f'
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')`,
};

export async function schemaFingerprint(url: string): Promise<Map<string, Set<string>>> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const result = new Map<string, Set<string>>();
    for (const [kind, sql] of Object.entries(QUERIES)) {
      const rows = await client.query<{ item: string }>(sql, [SCHEMAS]);
      result.set(kind, new Set(rows.rows.map((row) => row.item)));
    }
    return result;
  } finally {
    await client.end();
  }
}

export function diffFingerprints(
  a: Map<string, Set<string>>,
  b: Map<string, Set<string>>,
): string[] {
  const differences: string[] = [];
  for (const kind of Object.keys(QUERIES)) {
    const left = a.get(kind) ?? new Set<string>();
    const right = b.get(kind) ?? new Set<string>();
    for (const item of [...left].sort())
      if (!right.has(item)) differences.push(`- [${kind}] ${item}`);
    for (const item of [...right].sort())
      if (!left.has(item)) differences.push(`+ [${kind}] ${item}`);
  }
  return differences;
}

async function main(): Promise<void> {
  const [urlA, urlB] = process.argv.slice(2);
  if (!urlA || !urlB) throw new Error('Uso: tsx scripts/db/compare-schemas.ts <url-A> <url-B>');
  const differences = diffFingerprints(
    await schemaFingerprint(urlA),
    await schemaFingerprint(urlB),
  );
  if (differences.length > 0) {
    process.stderr.write(
      `❌ Los esquemas difieren (${differences.length} elementos; «-» sólo en A, «+» sólo en B):\n${differences.join('\n')}\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    '✅ Esquemas idénticos (columnas, restricciones, índices, triggers, funciones).\n',
  );
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
