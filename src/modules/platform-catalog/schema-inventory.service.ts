/**
 * Inventario de tablas leído del `information_schema` de la base de ESTE backend.
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
WITH pk AS (
  SELECT kcu.table_schema, kcu.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_schema = tc.constraint_schema
     AND kcu.constraint_name = tc.constraint_name
     AND kcu.table_schema = tc.table_schema
     AND kcu.table_name = tc.table_name
   WHERE tc.constraint_type = 'PRIMARY KEY'
)
SELECT c.table_schema AS "schemaName",
       c.table_name   AS "tableName",
       c.column_name  AS "columnName",
       (pk.column_name IS NOT NULL) AS "isPrimaryKey"
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema
   AND t.table_name = c.table_name
   AND t.table_type = 'BASE TABLE'
  LEFT JOIN pk
    ON pk.table_schema = c.table_schema
   AND pk.table_name = c.table_name
   AND pk.column_name = c.column_name
 WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
 ORDER BY c.table_schema, c.table_name, c.ordinal_position;
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
