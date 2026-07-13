import { findCheckLiteral, resolveSeedValue } from './seed-value-resolver';
import type { SeedColumn } from './seed-catalog.types';

const column = (columnName: string, dataType: string): SeedColumn => ({
  columnName,
  dataType,
  udtSchema: 'pg_catalog',
  udtName: dataType,
  isNullable: false,
  hasDefault: false,
  isIdentity: false,
  isGenerated: false,
});

describe('seed-value-resolver', () => {
  it('prioriza un literal permitido por CHECK', () => {
    expect(findCheckLiteral('status', ["CHECK ((status = ANY (ARRAY['DRAFT', 'ACTIVE'])))"])).toBe('DRAFT');
  });

  it('genera fechas finales posteriores a las iniciales', () => {
    const start = resolveSeedValue('contract', column('start_date', 'date'), []);
    const end = resolveSeedValue('contract', column('end_date', 'date'), []);
    expect(String(end) > String(start)).toBe(true);
  });

  it('genera correos deterministas y válidos', () => {
    expect(resolveSeedValue('users', column('email', 'character varying'), [])).toMatch(
      /^[a-f0-9]{8}@seed\.atlas\.local$/,
    );
  });

  it('mantiene montos contables básicos consistentes', () => {
    expect(resolveSeedValue('invoice', column('net_amount', 'numeric'), [])).toBe(100);
    expect(resolveSeedValue('invoice', column('tax_amount', 'numeric'), [])).toBe(13);
    expect(resolveSeedValue('invoice', column('gross_amount', 'numeric'), [])).toBe(113);
  });
});
