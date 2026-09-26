/**
 * P-13 · Aislamiento por ENTIDAD LEGAL en la contabilidad, de extremo a extremo (HTTP + PostgreSQL).
 *
 * Regla del ERP (`LegalEntityAccessService`): sólo ADMIN opera todas las entidades; cualquier otro
 * rol necesita que su token traiga la entidad en `legalEntityIds`. Aquí no se comprueba que exista
 * `@Roles`: se pide el RECURSO CONCRETO de la otra entidad —por id, en listados, en lotes y como
 * referencia dentro de un cuerpo— y se exige que no se lea ni se escriba nada.
 *
 * Actores: contable de A (ACCOUNTANT, entidad A), CFO de A, tesorería de A, ADMIN, y el token REAL
 * de FINANCE_MANAGER que emite hoy el ERP (FINANCE+ACCOUNTANT+CFO+TREASURY sin `legalEntityIds`).
 */
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { describeWithDatabase } from './support/coverage-integration-db';
import { bootAuthzHttpApp, signAccessToken } from './support/authz-http-app';
import type { AuthzHttpApp } from './support/authz-http-app';
import { seedLegalEntityWorld, seedSharedAccounting } from './support/authz-fixtures';
import type { LegalEntityWorld, SharedAccounting } from './support/authz-fixtures';

describeWithDatabase('P-13 aislamiento por entidad legal (HTTP + PostgreSQL real)', () => {
  let h: AuthzHttpApp;
  let shared: SharedAccounting;
  let A: LegalEntityWorld;
  let B: LegalEntityWorld;
  let tokens: Record<'accountantA' | 'cfoA' | 'treasuryA' | 'admin' | 'financeNoScope', string>;

  const api = () => request(h.app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    h = await bootAuthzHttpApp('authz_le');
    shared = await seedSharedAccounting(h.sql);
    A = await seedLegalEntityWorld(h.sql, shared, 'A');
    B = await seedLegalEntityWorld(h.sql, shared, 'B');
    tokens = {
      accountantA: signAccessToken({
        sub: randomUUID(),
        roles: ['ACCOUNTANT'],
        legalEntityIds: [A.legalEntityId],
      }),
      cfoA: signAccessToken({
        sub: randomUUID(),
        roles: ['CFO'],
        legalEntityIds: [A.legalEntityId],
      }),
      treasuryA: signAccessToken({
        sub: randomUUID(),
        roles: ['TREASURY'],
        legalEntityIds: [A.legalEntityId],
      }),
      admin: signAccessToken({ sub: randomUUID(), roles: ['ADMIN'] }),
      financeNoScope: signAccessToken({
        sub: randomUUID(),
        roles: ['FINANCE', 'ACCOUNTANT', 'CFO', 'TREASURY'],
      }),
    };
  }, 180_000);

  afterAll(async () => {
    await h?.close();
  });

  describe('documento contable (lectura por id)', () => {
    it('el contable de A lee SU documento con sus líneas', async () => {
      const res = await api()
        .get(`/api/v1/accounting/documents/${A.documentId}`)
        .set(bearer(tokens.accountantA))
        .expect(200);
      expect(res.body.data.document.id).toBe(A.documentId);
    });

    it('GET /accounting/documents/:id de otra entidad legal responde 403 y no filtra el documento', async () => {
      const res = await api()
        .get(`/api/v1/accounting/documents/${B.documentId}`)
        .set(bearer(tokens.accountantA))
        .expect(403);
      expect(res.body.error.code).toBe('LEGAL_ENTITY_FORBIDDEN');
      expect(JSON.stringify(res.body)).not.toContain(B.legalEntityId);
    });

    it('un documento inexistente responde 404 y no 403 ni 500', async () => {
      const res = await api()
        .get(`/api/v1/accounting/documents/${randomUUID()}`)
        .set(bearer(tokens.accountantA))
        .expect(404);
      expect(res.body.error.code).toBe('ACCOUNTING_DOCUMENT_NOT_FOUND');
    });

    it('el token de finanzas SIN alcance de entidad no lee ningún documento (falla cerrado)', async () => {
      const res = await api()
        .get(`/api/v1/accounting/documents/${A.documentId}`)
        .set(bearer(tokens.financeNoScope))
        .expect(403);
      expect(res.body.error.code).toBe('LEGAL_ENTITY_SCOPE_REQUIRED');
    });

    it('ADMIN lee documentos de cualquier entidad', async () => {
      await api()
        .get(`/api/v1/accounting/documents/${B.documentId}`)
        .set(bearer(tokens.admin))
        .expect(200);
    });

    it('el listado de documentos sólo trae los de la entidad del token', async () => {
      const res = await api()
        .get('/api/v1/accounting/documents')
        .set(bearer(tokens.accountantA))
        .expect(200);
      const ids = (res.body.data.items as Array<{ id: string }>).map((row) => row.id);
      expect(ids).toContain(A.documentId);
      expect(ids).not.toContain(B.documentId);
    });
  });

  describe('documento contable (mutaciones y lotes)', () => {
    it('contabilizar el documento de otra entidad responde 403 y lo deja en DRAFT', async () => {
      await api()
        .patch(`/api/v1/accounting/documents/${B.documentId}/post`)
        .set(bearer(tokens.accountantA))
        .expect(403);
      const { rows } = await h.sql.query('SELECT status FROM accounting_document WHERE id = $1', [
        B.documentId,
      ]);
      expect(rows[0].status).toBe('DRAFT');
    });

    it('revertir el documento de otra entidad responde 403', async () => {
      await api()
        .post(`/api/v1/accounting/documents/${B.documentId}/reverse`)
        .set(bearer(tokens.accountantA))
        .send({ reversalDate: new Date().toISOString().slice(0, 10), reason: 'prueba P-13' })
        .expect(403);
    });

    const draftFor = (world: LegalEntityWorld, lineExtras: Record<string, string> = {}) => ({
      legalEntityId: world.legalEntityId,
      documentType: 'JOURNAL',
      documentDate: new Date().toISOString().slice(0, 10),
      currencyCode: 'BOB',
      lines: [
        {
          glAccountId: shared.cashAccountId,
          debit: '5.00',
          currencyCode: 'BOB',
          amountLc: '5.00',
          ...lineExtras,
        },
        {
          glAccountId: shared.revenueAccountId,
          credit: '5.00',
          currencyCode: 'BOB',
          amountLc: '5.00',
        },
      ],
    });

    it('un lote con UN documento de otra entidad se rechaza entero: no se persiste ninguno', async () => {
      const before = await h.sql.query('SELECT count(*)::int AS n FROM accounting_document');
      await api()
        .post('/api/v1/accounting/documents/bulk')
        .set(bearer(tokens.accountantA))
        .send({ items: [draftFor(A), draftFor(B)] })
        .expect(403);
      const after = await h.sql.query('SELECT count(*)::int AS n FROM accounting_document');
      expect(after.rows[0].n).toBe(before.rows[0].n);
    });

    it('un asiento de A no puede imputar al centro de costo de B (referencia ajena en el cuerpo)', async () => {
      const res = await api()
        .post('/api/v1/accounting/documents')
        .set(bearer(tokens.accountantA))
        .send(draftFor(A, { costCenterId: B.costCenterId }))
        .expect(409);
      expect(res.body.error.code).toBe('LINE_COST_CENTER_LEGAL_ENTITY_MISMATCH');
    });

    it('un asiento de A no puede imputar al centro de beneficio de B', async () => {
      const res = await api()
        .post('/api/v1/accounting/documents')
        .set(bearer(tokens.accountantA))
        .send(draftFor(A, { profitCenterId: B.profitCenterId }))
        .expect(409);
      expect(res.body.error.code).toBe('LINE_PROFIT_CENTER_LEGAL_ENTITY_MISMATCH');
    });

    it('el mismo asiento con las dimensiones de A se crea (prueba positiva)', async () => {
      const res = await api()
        .post('/api/v1/accounting/documents')
        .set(bearer(tokens.accountantA))
        .send(draftFor(A, { costCenterId: A.costCenterId, profitCenterId: A.profitCenterId }))
        .expect(201);
      expect(res.body.data.document.legalEntityId).toBe(A.legalEntityId);
    });
  });

  describe('vínculos de asientos (journal-entries/:id/links)', () => {
    it('listar los vínculos del asiento de otra entidad responde 403', async () => {
      await api()
        .get(`/api/v1/accounting/journal-entries/${B.journalEntryId}/links`)
        .set(bearer(tokens.accountantA))
        .expect(403);
    });

    it('vincular algo al asiento de otra entidad responde 403 y no crea el vínculo', async () => {
      await api()
        .post(`/api/v1/accounting/journal-entries/${B.journalEntryId}/links`)
        .set(bearer(tokens.accountantA))
        .send({ entityType: 'COST_CENTER', entityId: A.costCenterId })
        .expect(403);
      const { rows } = await h.sql.query(
        'SELECT count(*)::int AS n FROM journal_entry_entity_link WHERE journal_entry_id = $1',
        [B.journalEntryId],
      );
      expect(rows[0].n).toBe(0);
    });

    it('un asiento inexistente responde 404', async () => {
      await api()
        .get(`/api/v1/accounting/journal-entries/${randomUUID()}/links`)
        .set(bearer(tokens.accountantA))
        .expect(404);
    });

    it('el asiento propio sí se vincula (prueba positiva)', async () => {
      await api()
        .post(`/api/v1/accounting/journal-entries/${A.journalEntryId}/links`)
        .set(bearer(tokens.accountantA))
        .send({ entityType: 'COST_CENTER', entityId: A.costCenterId })
        .expect(201);
    });
  });

  describe('condiciones de pago a proveedor', () => {
    it('el listado sin filtro sólo trae las condiciones de la entidad del token', async () => {
      const res = await api()
        .get('/api/v1/accounting/supplier-payment-terms')
        .set(bearer(tokens.treasuryA))
        .expect(200);
      const ids = (res.body.data as Array<{ id: string }>).map((row) => row.id);
      expect(ids).toContain(A.supplierTermsId);
      expect(ids).not.toContain(B.supplierTermsId);
    });

    it('filtrar el listado por la entidad ajena responde 403', async () => {
      await api()
        .get(`/api/v1/accounting/supplier-payment-terms?legalEntityId=${B.legalEntityId}`)
        .set(bearer(tokens.treasuryA))
        .expect(403);
    });

    it('leer la condición de otra entidad por id responde 403', async () => {
      await api()
        .get(`/api/v1/accounting/supplier-payment-terms/${B.supplierTermsId}`)
        .set(bearer(tokens.treasuryA))
        .expect(403);
    });

    it('editar la condición de otra entidad responde 403 y no la cambia', async () => {
      await api()
        .patch(`/api/v1/accounting/supplier-payment-terms/${B.supplierTermsId}`)
        .set(bearer(tokens.cfoA))
        .send({ termDays: 1 })
        .expect(403);
      const { rows } = await h.sql.query(
        'SELECT term_days FROM supplier_payment_terms WHERE id = $1',
        [B.supplierTermsId],
      );
      expect(rows[0].term_days).toBe(30);
    });

    it('simular sobre la condición de otra entidad responde 403', async () => {
      await api()
        .post(`/api/v1/accounting/supplier-payment-terms/${B.supplierTermsId}/simulate`)
        .set(bearer(tokens.treasuryA))
        .send({ invoiceDate: '2026-01-10', amount: 100 })
        .expect(403);
    });

    it('crear una condición en la entidad ajena responde 403', async () => {
      await api()
        .post('/api/v1/accounting/supplier-payment-terms')
        .set(bearer(tokens.cfoA))
        .send({
          legalEntityId: B.legalEntityId,
          supplierBpId: B.supplierBpId,
          code: 'P13-AJENA',
          name: 'Condición ajena',
          currencyCode: 'BOB',
          modality: 'CONTADO',
          paymentMethod: 'CHEQUE',
          validFrom: '2026-01-01',
        })
        .expect(403);
    });

    it('la condición propia sí se renegocia (prueba positiva)', async () => {
      await api()
        .patch(`/api/v1/accounting/supplier-payment-terms/${A.supplierTermsId}`)
        .set(bearer(tokens.cfoA))
        .send({ termDays: 45 })
        .expect(200);
    });

    it('la condición propia se lee y una inexistente da 404', async () => {
      await api()
        .get(`/api/v1/accounting/supplier-payment-terms/${A.supplierTermsId}`)
        .set(bearer(tokens.treasuryA))
        .expect(200);
      await api()
        .get(`/api/v1/accounting/supplier-payment-terms/${randomUUID()}`)
        .set(bearer(tokens.treasuryA))
        .expect(404);
    });
  });

  describe('listados maestros de la estructura financiera', () => {
    const cases: Array<[string, (w: LegalEntityWorld) => string]> = [
      ['legal-entities', (w) => w.legalEntityId],
      ['branches', (w) => w.branchId],
      ['fiscal-years', (w) => w.fiscalYearId],
      ['periods', (w) => w.periodId],
      ['ledgers', (w) => w.ledgerId],
      ['cost-centers', (w) => w.costCenterId],
      ['profit-centers', (w) => w.profitCenterId],
      ['bank-accounts', (w) => w.bankAccountId],
    ];

    it.each(cases)(
      'GET /accounting/financial-structure/%s no devuelve filas de otra entidad legal',
      async (path, pick) => {
        const res = await api()
          .get(`/api/v1/accounting/financial-structure/${path}`)
          .set(bearer(tokens.accountantA))
          .expect(200);
        const ids = (res.body.data as Array<{ id: string }>).map((row) => row.id);
        expect(ids).toContain(pick(A));
        expect(ids).not.toContain(pick(B));
      },
    );

    it('ADMIN sigue viendo los maestros de todas las entidades', async () => {
      const res = await api()
        .get('/api/v1/accounting/financial-structure/bank-accounts')
        .set(bearer(tokens.admin))
        .expect(200);
      const ids = (res.body.data as Array<{ id: string }>).map((row) => row.id);
      expect(ids).toEqual(expect.arrayContaining([A.bankAccountId, B.bankAccountId]));
    });
  });

  describe('eventos facturables', () => {
    it('GET /accounting/billing/events no devuelve eventos de contratos de otra entidad', async () => {
      const admin = signAccessToken({
        sub: randomUUID(),
        roles: ['ACCOUNTANT'],
        legalEntityIds: [A.legalEntityId],
      });
      const res = await api()
        .get('/api/v1/accounting/billing/events')
        .set(bearer(admin))
        .expect(200);
      const ids = (res.body.data as Array<{ id: string }>).map((row) => row.id);
      expect(ids).toContain(A.billingEventId);
      expect(ids).not.toContain(B.billingEventId);
    });

    it('registrar un evento facturable sobre el contrato de otra entidad responde 403', async () => {
      await api()
        .post('/api/v1/accounting/billing/events')
        .set(bearer(tokens.accountantA))
        .send({
          contractId: B.contractId,
          eventType: 'SAAS',
          eventTime: new Date().toISOString(),
          baseAmount: '10.00',
        })
        .expect(403);
    });
  });

  describe('rol sin permiso sobre la contabilidad', () => {
    it.each([
      ['MERCHANT_ADMIN', '/api/v1/accounting/documents'],
      ['COLLECTIONS', '/api/v1/accounting/documents'],
      ['OPERATIONS', '/api/v1/accounting/outbox/status'],
      ['AUDITOR', '/api/v1/accounting/supplier-payment-terms'],
      ['TREASURY', '/api/v1/accounting/closings/periods/close'],
    ])('%s en %s responde 403 aunque tenga la entidad en el token', async (role, path) => {
      const token = signAccessToken({
        sub: randomUUID(),
        roles: [role],
        legalEntityIds: [A.legalEntityId],
      });
      const call = path.endsWith('/close') ? api().post(path).send({}) : api().get(path);
      await call.set(bearer(token)).expect(403);
    });
  });
});
