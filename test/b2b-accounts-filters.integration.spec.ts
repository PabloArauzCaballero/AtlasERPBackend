/**
 * Filtros Categoría, Rubro y Etiqueta de CRM · Cuentas contra PostgreSQL REAL (adenda 2026-09-29,
 * 4d). Antes eran `ILIKE <valor>` sin comodines: igualdad sin mayúsculas, así que «restaur» no
 * encontraba «Restaurantes», y un `_` tecleado casaba con cualquier carácter. Ahora CONTIENEN lo
 * escrito, con `%` y `_` escapados, y el valor exacto que manda un select sigue casando.
 * Datos sintéticos con una marca propia para no depender de lo que haya en la base.
 */
import { randomUUID } from 'node:crypto';
import { QueryTypes } from 'sequelize';
import { B2BSalesCrmRepository } from '../src/modules/b2b-sales-crm/repositories/b2b-sales-crm.repository';
import { createMigratedDatabase, describeWithDatabase } from './support/coverage-integration-db';
import type { MigratedDatabase } from './support/coverage-integration-db';
import { buildCoverageHarness } from './support/coverage-fixtures';
import type { CoverageHarness } from './support/coverage-fixtures';

describeWithDatabase('CRM · filtros de cuentas por contenido (PostgreSQL real)', () => {
  let db: MigratedDatabase;
  let h: CoverageHarness;
  let repository: B2BSalesCrmRepository;
  const mark = `zq${randomUUID().slice(0, 6)}`;
  const names: Record<string, string> = {};

  async function account(key: string, category: string, businessLine: string, tags: string[]) {
    const rows = await h.sequelize.query<{ id: string }>(
      `INSERT INTO atlas_sales.b2b_accounts (legal_name, trade_name, tax_id, lifecycle_status, category, business_line)
       VALUES ($1, $1, $2, 'CUSTOMER', $3, $4) RETURNING id`,
      {
        bind: [`Cuenta ${key} ${mark}`, `NIT-${key}-${mark}`, category, businessLine],
        type: QueryTypes.SELECT,
      },
    );
    const id = rows[0]!.id;
    names[id] = key;
    for (const tag of tags) {
      const tagRows = await h.sequelize.query<{ id: string }>(
        `INSERT INTO atlas_sales.account_tags (name) VALUES ($1)
         ON CONFLICT (lower(name)) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        { bind: [tag], type: QueryTypes.SELECT },
      );
      await h.sequelize.query(
        'INSERT INTO atlas_sales.b2b_account_tags (account_id, tag_id) VALUES ($1, $2)',
        { bind: [id, tagRows[0]!.id] },
      );
    }
  }

  async function keys(filter: { category?: string; businessLine?: string; tag?: string }) {
    const result = await repository.listAccounts({
      offset: 0,
      limit: 100,
      search: mark,
      sortBy: 'legalName',
      sortOrder: 'ASC',
      ...filter,
    });
    return result.rows.map((row) => names[row.id]).sort();
  }

  beforeAll(async () => {
    db = await createMigratedDatabase('crm_filters');
    h = await buildCoverageHarness(db.url);
    repository = h.moduleRef.get(B2BSalesCrmRepository);
    await account('rest', `Restaurantes ${mark}`, 'Comida rápida', [`Premium ${mark}`]);
    await account('farm', `Farmacia ${mark}`, 'Salud', [`Premium%${mark}`]);
    await account('cafe_', `Café_Bar ${mark}`, 'Café de especialidad', []);
    await account('cafeX', `CaféXBar ${mark}`, 'Bar', []);
  }, 120_000);

  afterAll(async () => {
    await h?.close();
    await db?.drop();
  });

  it('la categoría CONTIENE lo escrito, sin distinguir mayúsculas', async () => {
    expect(await keys({ category: `restaur` })).toEqual(['rest']);
  });

  it('el valor exacto que manda un select sigue casando', async () => {
    expect(await keys({ category: `Farmacia ${mark}` })).toEqual(['farm']);
  });

  it('un `_` tecleado es texto, no comodín', async () => {
    expect(await keys({ category: `café_bar` })).toEqual(['cafe_']);
  });

  it('el rubro contiene lo escrito', async () => {
    expect(await keys({ businessLine: 'especialidad' })).toEqual(['cafe_']);
  });

  it('la etiqueta contiene lo escrito y un `%` tecleado es texto', async () => {
    expect(await keys({ tag: `premium ${mark}` })).toEqual(['rest']);
    expect(await keys({ tag: `premium%${mark}` })).toEqual(['farm']);
    expect(await keys({ tag: 'premium' })).toEqual(['farm', 'rest']);
  });
});
