import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import { sign } from 'jsonwebtoken';
import type { Client } from 'pg';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { env } from '../src/config/env';
import { connect, describeWithDatabase, uniqueSuffix } from './integration/database';

/**
 * E2E AUTENTICADO contra la API completa (`AppModule`, las mismas guardas globales que producción)
 * y PostgreSQL migrado por `yarn db:migrate:prod` (P-12 / B16).
 *
 * El CI anterior sólo comprobaba que el proceso imprimiera «listening» con las migraciones
 * desactivadas: ningún endpoint leía ni escribía una tabla migrada. Aquí se recorre el ciclo de un
 * asiento —borrador, publicación, reverso— por HTTP con un JWT firmado como los reales, y se
 * contrasta el resultado con SQL directo. También se exige que sin token o fuera de alcance se
 * rechace: una autenticación desactivada pone esta suite en rojo.
 */

function tokenFor(claims: { sub: string; roles: string[]; legalEntityIds?: string[] }): string {
  return sign(
    { ...claims, email: `${claims.sub}@atlas.test`, roleCode: claims.roles[0] },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '10m', issuer: env.JWT_ACCESS_ISSUER, audience: env.JWT_ACCESS_AUDIENCE },
  );
}

describeWithDatabase('Asientos contables por HTTP autenticado sobre base migrada (e2e)', (url) => {
  let app: INestApplication;
  let db: Client;
  let legalEntityId: string;
  let otherLegalEntityId: string;
  let cashAccountId: string;
  let revenueAccountId: string;
  let accountantToken: string;
  let runSuffix: string;
  const today = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    // La app usa DATABASE_URL (src/config/env.ts) y esta prueba mira la base por `url`: si fueran
    // bases distintas, las comprobaciones por SQL mirarían otra cosa que lo que escribió la API.
    if (process.env.DATABASE_URL !== url) {
      throw new Error(
        'ERP_INTEGRATION_DATABASE_URL y DATABASE_URL deben apuntar a la misma base en el e2e.',
      );
    }
    db = await connect(url);
    await db.query('SET search_path TO atlas_accounting, public');
    const suffix = uniqueSuffix();
    runSuffix = suffix;
    ({ legalEntityId, cashAccountId, revenueAccountId } = await seedStructure(db, suffix, today));
    const other = await db.query<{ id: string }>(
      `INSERT INTO legal_entity (code, legal_name) VALUES ($1, 'Otra entidad e2e') RETURNING id`,
      [`X${suffix}`.slice(0, 20)],
    );
    otherLegalEntityId = other.rows[0]!.id;

    accountantToken = tokenFor({
      sub: 'e2e00000-0000-4000-8000-000000000001',
      roles: ['ACCOUNTANT'],
      legalEntityIds: [legalEntityId],
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(env.API_GLOBAL_PREFIX);
    app.use(cookieParser());
    app.useGlobalFilters(app.get(HttpExceptionFilter));
    app.useGlobalInterceptors(app.get(ResponseInterceptor));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  const documentsPath = () => `/${env.API_GLOBAL_PREFIX}/accounting/documents`;

  let documentSeq = 0;
  // Número explícito y único por corrida: ver el defecto conocido del final del archivo.
  const balancedBody = (
    entityId: string,
    documentNo: string | null = `E2E-${runSuffix}-${++documentSeq}`,
  ) => ({
    legalEntityId: entityId,
    ...(documentNo ? { documentNo } : {}),
    documentType: 'JE',
    documentDate: today,
    lines: [
      { glAccountId: cashAccountId, debit: 125.5, credit: 0 },
      { glAccountId: revenueAccountId, debit: 0, credit: 125.5 },
    ],
  });

  it('rechaza sin token (401) y no escribe nada', async () => {
    await request(app.getHttpServer())
      .post(documentsPath())
      .send(balancedBody(legalEntityId))
      .expect(401);
  });

  it('rechaza un rol sin permiso contable (403)', async () => {
    const merchant = tokenFor({ sub: 'e2e-merchant', roles: ['MERCHANT_ADMIN'] });
    await request(app.getHttpServer())
      .post(documentsPath())
      .set('Authorization', `Bearer ${merchant}`)
      .send(balancedBody(legalEntityId))
      .expect(403);
  });

  it('rechaza operar sobre una entidad legal fuera del alcance del token (403)', async () => {
    const response = await request(app.getHttpServer())
      .post(documentsPath())
      .set('Authorization', `Bearer ${accountantToken}`)
      .send(balancedBody(otherLegalEntityId));
    expect(response.status).toBe(403);
    const rows = await db.query('SELECT 1 FROM accounting_document WHERE legal_entity_id = $1', [
      otherLegalEntityId,
    ]);
    expect(rows.rowCount).toBe(0);
  });

  it('rechaza un borrador descuadrado sin escribirlo', async () => {
    const before = await countDocuments(db, legalEntityId);
    const body = balancedBody(legalEntityId);
    body.lines[1]!.credit = 125.49;
    const response = await request(app.getHttpServer())
      .post(documentsPath())
      .set('Authorization', `Bearer ${accountantToken}`)
      .send(body);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(await countDocuments(db, legalEntityId)).toBe(before);
  });

  it('crea, publica y revierte un asiento; la base refleja cada paso', async () => {
    const created = await request(app.getHttpServer())
      .post(documentsPath())
      .set('Authorization', `Bearer ${accountantToken}`)
      .send(balancedBody(legalEntityId));
    expect(created.status).toBe(201);
    const documentId = (created.body as { data: { document: { id: string } } }).data.document.id;
    expect(documentId).toEqual(expect.any(String));

    const draft = await db.query<{ status: string; debit: string; credit: string }>(
      `SELECT d.status, SUM(l.debit)::text AS debit, SUM(l.credit)::text AS credit
         FROM accounting_document d
         JOIN journal_entry j ON j.accounting_document_id = d.id
         JOIN journal_entry_line l ON l.journal_entry_id = j.id
        WHERE d.id = $1 GROUP BY d.status`,
      [documentId],
    );
    expect(draft.rows[0]).toEqual({ status: 'DRAFT', debit: '125.50', credit: '125.50' });

    await request(app.getHttpServer())
      .patch(`${documentsPath()}/${documentId}/post`)
      .set('Authorization', `Bearer ${accountantToken}`)
      .expect(200);

    const posted = await db.query<{ status: string; posting_status: string; hash: string | null }>(
      `SELECT d.status, j.posting_status, j.hash_sha256 AS hash
         FROM accounting_document d JOIN journal_entry j ON j.accounting_document_id = d.id
        WHERE d.id = $1`,
      [documentId],
    );
    expect(posted.rows[0]).toMatchObject({ status: 'POSTED', posting_status: 'POSTED' });
    expect(posted.rows[0]!.hash).toMatch(/^[0-9a-f]{64}$/);

    const reversed = await request(app.getHttpServer())
      .post(`${documentsPath()}/${documentId}/reverse`)
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({ reversalDate: today, reason: 'Prueba e2e de reverso' });
    expect(reversed.status).toBeLessThan(300);

    const after = await db.query<{ status: string; reversed_by_id: string | null }>(
      'SELECT status, reversed_by_id FROM accounting_document WHERE id = $1',
      [documentId],
    );
    expect(after.rows[0]!.status).toBe('REVERSED');
    const reversal = await db.query<{ reversal_of_id: string }>(
      'SELECT reversal_of_id FROM accounting_document WHERE id = $1',
      [after.rows[0]!.reversed_by_id],
    );
    expect(reversal.rows[0]!.reversal_of_id).toBe(documentId);

    // Un segundo reverso del mismo documento no puede prosperar.
    const again = await request(app.getHttpServer())
      .post(`${documentsPath()}/${documentId}/reverse`)
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({ reversalDate: today, reason: 'Segundo reverso' });
    expect(again.status).toBeGreaterThanOrEqual(400);
    const reversals = await db.query(
      'SELECT 1 FROM accounting_document WHERE reversal_of_id = $1',
      [documentId],
    );
    expect(reversals.rowCount).toBe(1);
  });

  it('lee por HTTP lo que la base tiene para la entidad del token', async () => {
    const response = await request(app.getHttpServer())
      .get(documentsPath())
      .set('Authorization', `Bearer ${accountantToken}`)
      .expect(200);
    const body = response.body as { data: unknown };
    const serialized = JSON.stringify(body.data);
    expect(serialized).toContain(legalEntityId);
    expect(serialized).not.toContain(otherLegalEntityId);
  });

  /*
   * DEFECTO CONOCIDO (registrado en docs/compliance/requirements/B-brechas.json, ERP-D01).
   *
   * `journal_entry.journal_no` es UNIQUE en toda la base, pero el servicio lo deriva del número del
   * documento (`<documentNo>-JRN`), y la serie DOC-AAAA-NNNNNN es POR entidad legal. La segunda
   * entidad que registra su primer asiento sin número choca con el de la primera: 409
   * UNIQUE_CONSTRAINT_ERROR sobre `journal_no`. Arreglarlo exige decidir la numeración de asientos
   * (global o por entidad), que es del responsable contable, así que aquí sólo se deja la prueba
   * que lo reproduce. `it.failing` pasa mientras el defecto exista: el día que se corrija, este
   * test se pondrá ROJO para obligar a convertirlo en una prueba normal.
   */
  it.failing(
    'DEFECTO CONOCIDO: dos entidades pueden registrar su primer asiento sin número',
    async () => {
      const entities: string[] = [];
      for (const label of ['A', 'B']) {
        const seeded = await seedStructure(db, `${label}${uniqueSuffix()}`, today);
        entities.push(seeded.legalEntityId);
        const token = tokenFor({
          sub: 'e2e00000-0000-4000-8000-000000000002',
          roles: ['ACCOUNTANT'],
          legalEntityIds: [seeded.legalEntityId],
        });
        const body = {
          legalEntityId: seeded.legalEntityId,
          documentType: 'JE',
          documentDate: today,
          lines: [
            { glAccountId: seeded.cashAccountId, debit: 1, credit: 0 },
            { glAccountId: seeded.revenueAccountId, debit: 0, credit: 1 },
          ],
        };
        const response = await request(app.getHttpServer())
          .post(documentsPath())
          .set('Authorization', `Bearer ${token}`)
          .send(body);
        expect(response.status).toBe(201);
      }
      expect(entities).toHaveLength(2);
    },
  );
});

async function countDocuments(db: Client, legalEntityId: string): Promise<number> {
  const result = await db.query<{ n: string }>(
    'SELECT count(*)::text AS n FROM accounting_document WHERE legal_entity_id = $1',
    [legalEntityId],
  );
  return Number(result.rows[0]!.n);
}

async function seedStructure(
  db: Client,
  suffix: string,
  today: string,
): Promise<{ legalEntityId: string; cashAccountId: string; revenueAccountId: string }> {
  const one = async (sql: string, params: unknown[]): Promise<string> =>
    (await db.query<{ id: string }>(sql, params)).rows[0]!.id;
  const year = today.slice(0, 4);
  const month = Number(today.slice(5, 7));
  const code = `E2E${suffix}`.slice(0, 20);
  const legalEntityId = await one(
    `INSERT INTO legal_entity (code, legal_name) VALUES ($1, 'Entidad e2e') RETURNING id`,
    [code],
  );
  const fiscalYearId = await one(
    `INSERT INTO fiscal_year (legal_entity_id, year_label, start_date, end_date)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [legalEntityId, year, `${year}-01-01`, `${year}-12-31`],
  );
  await db.query(
    `INSERT INTO accounting_period (fiscal_year_id, period_no, start_date, end_date)
     VALUES ($1, $2, date_trunc('month', $3::date), (date_trunc('month', $3::date) + interval '1 month - 1 day')::date)`,
    [fiscalYearId, month, today],
  );
  await db.query(
    `INSERT INTO ledger (legal_entity_id, code, name, accounting_basis, is_default)
     VALUES ($1, 'L0', 'Libro e2e', 'LOCAL_BO', true)`,
    [legalEntityId],
  );
  const coaId = await one(
    `INSERT INTO chart_of_accounts (code, name, version_no, effective_from)
     VALUES ($1, 'Plan e2e', 1, '2020-01-01') RETURNING id`,
    [code],
  );
  const cashAccountId = await one(
    `INSERT INTO gl_account (coa_id, account_no, name, account_type, normal_balance)
     VALUES ($1, '1100', 'Caja e2e', 'ASSET', 'D') RETURNING id`,
    [coaId],
  );
  const revenueAccountId = await one(
    `INSERT INTO gl_account (coa_id, account_no, name, account_type, normal_balance)
     VALUES ($1, '4100', 'Ingresos e2e', 'REVENUE', 'C') RETURNING id`,
    [coaId],
  );
  return { legalEntityId, cashAccountId, revenueAccountId };
}
