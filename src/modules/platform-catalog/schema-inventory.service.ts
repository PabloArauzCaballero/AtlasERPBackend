/**
 * Inventario de tablas leído del catálogo de PostgreSQL de la base de ESTE backend.
 *
 * Se consulta `pg_catalog` y no `information_schema`, y la diferencia no es estética: la vista
 * `key_column_usage` —la forma canónica de sacar las claves primarias— tardaba SEIS SEGUNDOS en una
 * base de 121 tablas, más que el plazo entero de la petición, así que la federación del bloque
 * fallaba por timeout y se reportaba como «el ERP no responde». La misma respuesta, exacta y con
 * las mismas 1180 filas, sale de `pg_class`/`pg_index` en 10 ms.
 *
 * Deliberadamente la misma técnica que aplican Atlas Backend y el motor de decisión sobre las
 * suyas, y no una lectura de los modelos de Sequelize. Lo que existe en la base es la verdad: una
 * migración SQL aplicada a mano —y este backend aplica muchas— no está en ningún modelo, y son
 * exactamente esas tablas las que nadie sabe explicar cuando alguien pregunta.
 *
 * La clasificación (PII, financiero, riesgo) es una HEURÍSTICA por nombre de columna. El
 * federador la guarda marcada como inferida y con confianza media, para que el portal la ponga en
 * cola de revisión humana en lugar de presentarla como un hecho establecido.
 */
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { QueryTypes, Sequelize } from 'sequelize';
import type { CatalogManifestDataEntity } from './platform-catalog.types';

interface ColumnRow {
  schemaName: string;
  tableName: string;
  columnName: string;
  isPrimaryKey: boolean;
}

const PII_HINTS = ['email', 'phone', 'msisdn', 'document', 'dni', 'nit', 'address', 'birth', 'full_name', 'first_name', 'last_name', 'ip_address', 'contact'];
const FINANCIAL_HINTS = ['amount', 'balance', 'limit', 'price', 'currency', 'interest', 'payment', 'invoice', 'debit', 'credit', 'tax'];
const RISK_HINTS = ['score', 'risk', 'decision', 'policy', 'rule', 'fraud', 'threshold', 'outcome'];
const AUDIT_HINTS = ['audit', 'log', 'event', 'trace', 'approval', 'journal', 'ledger', 'period'];

/** Esquema de la base → módulo del ERP. Lo que no encaja se declara sin clasificar, no se inventa. */
const SCHEMA_MODULES: Readonly<Record<string, string>> = {
  atlas_sales: 'b2b-sales-crm',
  atlas_accounting: 'accounting',
  atlas_ads: 'ads',
  atlas_audit: 'business-action-logs',
  atlas_files: 'files',
  atlas_portal: 'portal',
};

@Injectable()
export class SchemaInventoryService {
  constructor(@InjectConnection() private readonly sequelize: Sequelize) {}

  async collect(): Promise<CatalogManifestDataEntity[]> {
    const rows = await this.sequelize.query<ColumnRow>(
      `
SELECT n.nspname::text  AS "schemaName",
       c.relname::text  AS "tableName",
       a.attname::text  AS "columnName",
       COALESCE(i.indisprimary, false) AS "isPrimaryKey"
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_index i ON i.indrelid = c.oid AND i.indisprimary AND a.attnum = ANY(i.indkey)
 WHERE c.relkind = 'r'
   AND n.nspname NOT IN ('pg_catalog', 'information_schema')
   AND n.nspname NOT LIKE 'pg\\_%'
 ORDER BY n.nspname, c.relname, a.attnum;
`,
      { type: QueryTypes.SELECT },
    );

    const byTable = new Map<string, ColumnRow[]>();
    for (const row of rows) {
      const key = `${row.schemaName}.${row.tableName}`;
      const bucket = byTable.get(key);
      if (bucket) bucket.push(row);
      else byTable.set(key, [row]);
    }

    return [...byTable.values()].map((columns) => describe(columns));
  }
}

function describe(columns: readonly ColumnRow[]): CatalogManifestDataEntity {
  // `columns` nunca llega vacío: sale de agrupar filas por tabla, y un grupo existe porque tuvo
  // al menos una fila. El guard está para que el tipo lo diga, no porque el caso ocurra.
  const first = columns[0];
  if (!first) throw new Error('Grupo de columnas vacío al describir una entidad de datos.');
  const names = columns.map((column) => column.columnName.toLowerCase());
  const tableName = first.tableName;

  return {
    schemaName: first.schemaName,
    tableName,
    entityName: humanize(tableName),
    module: SCHEMA_MODULES[first.schemaName] ?? 'sin-clasificar',
    columnCount: columns.length,
    primaryKeyColumns: columns.filter((column) => column.isPrimaryKey).map((column) => column.columnName),
    containsPii: matchesAny(names, PII_HINTS),
    containsFinancialData: matchesAny(names, FINANCIAL_HINTS) || first.schemaName === 'atlas_accounting',
    containsRiskData: matchesAny(names, RISK_HINTS),
    isAuditCritical: matchesAny([tableName.toLowerCase()], AUDIT_HINTS) || first.schemaName === 'atlas_accounting',
    businessPurpose: `Tabla \`${first.schemaName}.${tableName}\` con ${columns.length} columnas. Propósito inferido del esquema: pendiente de revisión humana.`,
  };
}

function matchesAny(values: string[], hints: string[]): boolean {
  return values.some((value) => hints.some((hint) => value.includes(hint)));
}

function humanize(identifier: string): string {
  const words = identifier.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
