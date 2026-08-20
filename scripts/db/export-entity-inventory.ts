import { writeFileSync } from 'fs';
import { Client } from 'pg';
import { env } from '../../src/config/env';
import { resolveDbSslOptions } from '../../src/config/db-ssl';
import { PinoLoggerService } from '../../src/common/logger/pino-logger.service';

const logger = new PinoLoggerService();

/**
 * Exporta el inventario de entidades del ERP para el catálogo de metadata de AtlasBackend.
 *
 * ## Por qué un archivo y no una llamada
 *
 * El catálogo del portal vive en AtlasBackend y se puebla escaneando **sus** modelos por sistema
 * de archivos. Las tablas del ERP están en otro repositorio y en otra base, así que ese escaneo no
 * las ve nunca: 121 tablas —toda la contabilidad, el CRM y la publicidad— quedaban fuera del
 * portal que existe justamente para gobernar los datos de la plataforma.
 *
 * Se resuelve con un inventario VERSIONADO y no con una consulta en caliente por dos razones:
 *
 * 1. **Los dos servicios no comparten base ni despliegue.** Una llamada en caliente ataría el
 *    refresco del catálogo a que el ERP esté arriba, y convertiría un trabajo de metadata en algo
 *    que falla por una caída ajena.
 * 2. **Un inventario en el repositorio se revisa en el diff.** Que una tabla nueva aparezca en el
 *    catálogo es una decisión de gobierno, no un efecto secundario de haber corrido una migración.
 *
 * Es el mismo criterio que el portal de decisiones usa con `docs/superficie-motor.json`.
 *
 * ## Qué se exporta y qué no
 *
 * Sólo la ESTRUCTURA: schema, tabla, columnas, claves y comentarios. Ni una fila de datos. El
 * catálogo describe qué se guarda y por qué, no lo guardado.
 */

/** Los schemas del ERP que el portal debe gobernar. `public` queda fuera: es infraestructura. */
const EXPORTED_SCHEMAS = ['atlas_accounting', 'atlas_sales', 'atlas_audit'] as const;

const OUTPUT_FILE = 'src/database/metadata/erp-entity-inventory.json';

interface InventoryTable {
  schemaName: string;
  tableName: string;
  columnCount: number;
  primaryKey: string[];
  hasTenantColumn: boolean;
  comment: string | null;
}

async function main(): Promise<void> {
  const client = new Client({ connectionString: env.DATABASE_URL, ssl: resolveDbSslOptions(env) });
  await client.connect();

  try {
    const { rows } = await client.query<InventoryTable & { primary_key: string[] | null }>(
      `SELECT t.table_schema  AS "schemaName",
              t.table_name    AS "tableName",
              (SELECT count(*)::int
                 FROM information_schema.columns c
                WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name) AS "columnCount",
              COALESCE(
                (SELECT array_agg(kcu.column_name::text ORDER BY kcu.ordinal_position)
                   FROM information_schema.table_constraints tc
                   JOIN information_schema.key_column_usage kcu
                     ON kcu.constraint_name = tc.constraint_name
                    AND kcu.table_schema = tc.table_schema
                  WHERE tc.table_schema = t.table_schema
                    AND tc.table_name = t.table_name
                    AND tc.constraint_type = 'PRIMARY KEY'),
                ARRAY[]::text[]) AS "primary_key",
              EXISTS (SELECT 1 FROM information_schema.columns c
                       WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name
                         AND c.column_name IN ('tenant_id', '_tenant_id')) AS "hasTenantColumn",
              obj_description(format('%I.%I', t.table_schema, t.table_name)::regclass, 'pg_class') AS "comment"
         FROM information_schema.tables t
        WHERE t.table_type = 'BASE TABLE'
          AND t.table_schema = ANY($1::text[])
        ORDER BY t.table_schema, t.table_name`,
      [[...EXPORTED_SCHEMAS]],
    );

    const tables: InventoryTable[] = rows.map((row) => ({
      schemaName: row.schemaName,
      tableName: row.tableName,
      columnCount: row.columnCount,
      primaryKey: row.primary_key ?? [],
      hasTenantColumn: row.hasTenantColumn,
      comment: row.comment,
    }));

    /*
     * Sin fecha de generación a propósito. El archivo se versiona, y una marca de tiempo lo haría
     * cambiar en cada corrida aunque el esquema fuera idéntico: el diff dejaría de significar
     * «cambió el modelo de datos» y nadie volvería a mirarlo.
     */
    const inventory = {
      sourceSystem: 'atlas-erp',
      schemas: [...EXPORTED_SCHEMAS],
      tableCount: tables.length,
      tables,
    };

    writeFileSync(OUTPUT_FILE, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');
    logger.log('Inventario de entidades del ERP exportado.', {
      layer: 'script',
      script: 'export-entity-inventory',
      file: OUTPUT_FILE,
      tables: tables.length,
    });
  } finally {
    await client.end();
  }
}

void main().catch((error: unknown) => {
  // El mensaje se extrae a mano: el logger serializa el Error como `{}` y el fallo real —una
  // consulta rota, una columna que no existe— quedaba invisible.
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  logger.error('Fallo exportando el inventario.', {
    layer: 'script',
    script: 'export-entity-inventory',
    detail,
  });
  process.exitCode = 1;
});
