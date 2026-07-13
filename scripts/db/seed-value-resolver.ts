import { createHash, randomUUID } from 'crypto';
import type { SeedColumn } from './seed-catalog.types';

const exactValues: Readonly<Record<string, unknown>> = {
  country_code: 'BO',
  base_currency: 'BOB',
  currency: 'BOB',
  currency_code: 'BOB',
  timezone: 'America/La_Paz',
  normal_balance: 'D',
  language_code: 'es-BO',
  locale: 'es-BO',
  role_code: 'ADMIN',
  period_no: 1,
  line_no: 1,
  version_no: 1,
  useful_life_months: 36,
  width_px: 1200,
  height_px: 250,
};

export function resolveSeedValue(
  tableName: string,
  column: SeedColumn,
  checkDefinitions: readonly string[],
): unknown {
  const name = column.columnName.toLowerCase();
  if (name in exactValues) return exactValues[name];

  const checkValue = findCheckLiteral(name, checkDefinitions);
  if (checkValue !== undefined) return checkValue;

  if (column.dataType === 'USER-DEFINED') return undefined;
  if (column.dataType === 'uuid') return randomUUID();
  if (column.dataType === 'boolean') return booleanValue(name);
  if (isNumeric(column.dataType)) return numericValue(name);
  if (column.dataType === 'date') return dateValue(name);
  if (column.dataType.includes('timestamp')) return timestampValue(name);
  if (column.dataType === 'json' || column.dataType === 'jsonb') return jsonValue(name);
  if (column.dataType === 'ARRAY') return [];
  if (column.dataType === 'bytea') return Buffer.from('atlas-seed');
  if (column.dataType === 'inet') return '127.0.0.1';

  return stringValue(tableName, name, column.dataType);
}

export function findCheckLiteral(
  columnName: string,
  definitions: readonly string[],
): string | undefined {
  const definition = definitions.find((item) =>
    item.toLowerCase().includes(columnName.toLowerCase()),
  );
  if (!definition) return undefined;

  const matches = [...definition.matchAll(/'((?:''|[^'])*)'/g)];
  return matches[0]?.[1]?.replace(/''/g, "'");
}

function isNumeric(type: string): boolean {
  return ['smallint', 'integer', 'bigint', 'numeric', 'real', 'double precision'].includes(type);
}

function numericValue(name: string): number {
  if (name.includes('credit_amount')) return 0;
  if (name.includes('tax_amount')) return 13;
  if (name.includes('gross_amount') || name.includes('total_amount')) return 113;
  if (name.includes('net_amount')) return 100;
  if (name.includes('rate') || name.includes('percent')) return 10;
  if (name.includes('micros')) return 1_000_000;
  if (name.includes('sequence') || name.endsWith('_no')) return 1;
  return 100;
}

function booleanValue(name: string): boolean {
  if (name.startsWith('is_') && name.includes('active')) return true;
  if (name.includes('enabled') || name.includes('default') || name.includes('open')) return true;
  return false;
}

function dateValue(name: string): string {
  const now = new Date();
  if (name.includes('end') || name.includes('due') || name.includes('expiry')) {
    now.setUTCDate(now.getUTCDate() + 30);
  }
  return now.toISOString().slice(0, 10);
}

function timestampValue(name: string): Date {
  const now = new Date();
  if (name.includes('end') || name.includes('expires')) now.setUTCDate(now.getUTCDate() + 30);
  return now;
}

function jsonValue(name: string): unknown {
  if (name.includes('allowed') || name.endsWith('_ids') || name.includes('items')) return [];
  return {};
}

function stringValue(tableName: string, columnName: string, type: string): string {
  const key = `${tableName}_${columnName}`.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
  const suffix = createHash('sha1').update(key).digest('hex').slice(0, 8);
  if (columnName.includes('email')) return `${suffix}@seed.atlas.local`;
  if (columnName.includes('url')) return `https://seed.atlas.local/${suffix}`;
  if (columnName.includes('hash')) return createHash('sha256').update(key).digest('hex');
  if (columnName.includes('tax_id')) return `SEED-${suffix}`;
  if (columnName.includes('phone')) return '70000000';
  if (columnName.includes('country')) return 'BO';
  if (columnName.includes('currency')) return 'BOB';
  if (columnName.includes('code') || columnName.endsWith('_no')) return `SEED-${suffix}`;
  if (columnName.includes('name') || columnName.includes('description')) return `Registro seed ${suffix}`;
  if (type === 'character') return 'X';
  return `seed-${suffix}`;
}
