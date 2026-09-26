/**
 * ATL-03 · Aprobación del documento contable decidida por el servidor, y ATL-05 · listado filtrado
 * por entidad EN LA CONSULTA con total exacto. HTTP completo (guardas reales) + PostgreSQL migrado.
 *
 * Provisional mientras DEC-10 no fije umbrales: el cliente pide NOT_REQUIRED o PENDING; aprueba o
 * rechaza un CFO/ADMIN distinto del creador; PENDING, REJECTED y un APPROVED sin aprobador no se
 * publican.
 */
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { describeWithDatabase } from './support/coverage-integration-db';
import { bootAuthzHttpApp, signAccessToken } from './support/authz-http-app';
import type { AuthzHttpApp } from './support/authz-http-app';
import { seedLegalEntityWorld, seedSharedAccounting } from './support/authz-fixtures';
import type { LegalEntityWorld, SharedAccounting } from './support/authz-fixtures';

describeWithDatabase('ATL-03 / ATL-05 aprobación y listado de documentos contables', () => {
  let h: AuthzHttpApp;
  let shared: SharedAccounting;
  let A: LegalEntityWorld;
  const ids = { accountant: randomUUID(), cfo: randomUUID(), cfo2: randomUUID() };
  let tokens: Record<'accountant' | 'cfo' | 'cfo2' | 'admin', string>;

  const api = () => request(h.app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const today = () => new Date().toISOString().slice(0, 10);

  const draft = (approvalStatus?: string) => ({
    legalEntityId: A.legalEntityId,
    documentType: 'JOURNAL',
    documentDate: today(),
    currencyCode: 'BOB',
    ...(approvalStatus ? { approvalStatus } : {}),
    lines: [
      { glAccountId: shared.cashAccountId, debit: '7.00', currencyCode: 'BOB', amountLc: '7.00' },
      {
        glAccountId: shared.revenueAccountId,
        credit: '7.00',
        currencyCode: 'BOB',
        amountLc: '7.00',
      },
    ],
  });

  async function createDraft(token: string, approvalStatus?: string): Promise<string> {
    const res = await api()
      .post('/api/v1/accounting/documents')
      .set(bearer(token))
      .send(draft(approvalStatus))
      .expect(201);
    return res.body.data.document.id as string;
  }

  async function row(id: string) {
    const { rows } = await h.sql.query(
      `SELECT status, approval_status, approved_by, approved_at, rejected_by, rejected_at
         FROM accounting_document WHERE id = $1`,
      [id],
    );
    return rows[0];
  }

  async function journalCount(id: string, postingStatus: string): Promise<number> {
    const { rows } = await h.sql.query(
      `SELECT count(*)::int AS n FROM journal_entry
        WHERE accounting_document_id = $1 AND posting_status = $2`,
      [id, postingStatus],
    );
    return rows[0].n as number;
  }

  beforeAll(async () => {
    h = await bootAuthzHttpApp('approval_le');
    shared = await seedSharedAccounting(h.sql);
    A = await seedLegalEntityWorld(h.sql, shared, 'A');
    const scope = [A.legalEntityId];
    tokens = {
      accountant: signAccessToken({
        sub: ids.accountant,
        roles: ['ACCOUNTANT'],
        legalEntityIds: scope,
      }),
      cfo: signAccessToken({ sub: ids.cfo, roles: ['CFO'], legalEntityIds: scope }),
      cfo2: signAccessToken({ sub: ids.cfo2, roles: ['CFO'], legalEntityIds: scope }),
      admin: signAccessToken({ sub: randomUUID(), roles: ['ADMIN'] }),
    };
  }, 180_000);

  afterAll(async () => {
    await h?.close();
  });

  describe('alta: el cliente no autocertifica', () => {
    it('approvalStatus APPROVED en el cuerpo responde 422 y no escribe nada', async () => {
      const before = await h.sql.query('SELECT count(*)::int AS n FROM accounting_document');
      const res = await api()
        .post('/api/v1/accounting/documents')
        .set(bearer(tokens.admin))
        .send(draft('APPROVED'))
        .expect(422);
      expect(res.body.error.code).toBe('ACCOUNTING_DOCUMENT_APPROVAL_NOT_CLIENT_SETTABLE');
      const after = await h.sql.query('SELECT count(*)::int AS n FROM accounting_document');
      expect(after.rows[0].n).toBe(before.rows[0].n);
    });

    it('REJECTED en el cuerpo también es 422', async () => {
      await api()
        .post('/api/v1/accounting/documents')
        .set(bearer(tokens.accountant))
        .send(draft('REJECTED'))
        .expect(422);
    });

    it('sin approvalStatus sigue siendo NOT_REQUIRED y se publica (lo que hace el ERP web)', async () => {
      const id = await createDraft(tokens.accountant);
      expect((await row(id)).approval_status).toBe('NOT_REQUIRED');
      await api()
        .patch(`/api/v1/accounting/documents/${id}/post`)
        .set(bearer(tokens.accountant))
        .expect(200);
    });
  });

  describe('publicar exige aprobación', () => {
    it('PENDING → post 409 y ningún asiento publicado', async () => {
      const id = await createDraft(tokens.accountant, 'PENDING');
      const res = await api()
        .patch(`/api/v1/accounting/documents/${id}/post`)
        .set(bearer(tokens.accountant))
        .expect(409);
      expect(res.body.error.code).toBe('ACCOUNTING_DOCUMENT_APPROVAL_REQUIRED');
      expect((await row(id)).status).toBe('DRAFT');
      expect(await journalCount(id, 'POSTED')).toBe(0);
    });

    it('REJECTED → post 409 y sigue en DRAFT', async () => {
      const id = await createDraft(tokens.accountant, 'PENDING');
      await api()
        .patch(`/api/v1/accounting/documents/${id}/reject`)
        .set(bearer(tokens.cfo))
        .send({ reason: 'sin respaldo' })
        .expect(200);
      expect(await row(id)).toMatchObject({ approval_status: 'REJECTED', rejected_by: ids.cfo });
      await api()
        .patch(`/api/v1/accounting/documents/${id}/post`)
        .set(bearer(tokens.admin))
        .expect(409);
      expect((await row(id)).status).toBe('DRAFT');
      expect(await journalCount(id, 'POSTED')).toBe(0);
    });

    it('un APPROVED sin aprobador registrado (autocertificado de antes) no se publica', async () => {
      const id = await createDraft(tokens.accountant, 'PENDING');
      await h.sql.query(
        `UPDATE accounting_document SET approval_status = 'APPROVED' WHERE id = $1`,
        [id],
      );
      await api()
        .patch(`/api/v1/accounting/documents/${id}/post`)
        .set(bearer(tokens.admin))
        .expect(409);
    });
  });

  describe('aprobar y rechazar', () => {
    it('el creador no aprueba lo suyo: 403 y sigue PENDING', async () => {
      const id = await createDraft(tokens.cfo, 'PENDING');
      const res = await api()
        .patch(`/api/v1/accounting/documents/${id}/approve`)
        .set(bearer(tokens.cfo))
        .expect(403);
      expect(res.body.error.code).toBe('ACCOUNTING_DOCUMENT_SELF_APPROVAL_FORBIDDEN');
      expect(await row(id)).toMatchObject({ approval_status: 'PENDING', approved_by: null });
    });

    it('el contable (rol sin permiso de aprobar) recibe 403', async () => {
      const id = await createDraft(tokens.cfo, 'PENDING');
      await api()
        .patch(`/api/v1/accounting/documents/${id}/approve`)
        .set(bearer(tokens.accountant))
        .expect(403);
      expect((await row(id)).approval_status).toBe('PENDING');
    });

    it('aprueba otro CFO → queda approved_by/approved_at → post 200', async () => {
      const id = await createDraft(tokens.accountant, 'PENDING');
      await api()
        .patch(`/api/v1/accounting/documents/${id}/approve`)
        .set(bearer(tokens.cfo))
        .expect(200);
      const approved = await row(id);
      expect(approved).toMatchObject({ approval_status: 'APPROVED', approved_by: ids.cfo });
      expect(approved.approved_at).toBeInstanceOf(Date);
      await api()
        .patch(`/api/v1/accounting/documents/${id}/post`)
        .set(bearer(tokens.accountant))
        .expect(200);
      expect((await row(id)).status).toBe('POSTED');
      expect(await journalCount(id, 'POSTED')).toBe(1);
    });

    it('aprobar dos veces responde 409 y no reescribe el aprobador', async () => {
      const id = await createDraft(tokens.accountant, 'PENDING');
      await api()
        .patch(`/api/v1/accounting/documents/${id}/approve`)
        .set(bearer(tokens.cfo))
        .expect(200);
      const res = await api()
        .patch(`/api/v1/accounting/documents/${id}/approve`)
        .set(bearer(tokens.cfo2))
        .expect(409);
      expect(res.body.error.code).toBe('ACCOUNTING_DOCUMENT_NOT_PENDING_APPROVAL');
      expect((await row(id)).approved_by).toBe(ids.cfo);
    });

    it('la base impide reescribir una aprobación ya registrada', async () => {
      const id = await createDraft(tokens.accountant, 'PENDING');
      await api()
        .patch(`/api/v1/accounting/documents/${id}/approve`)
        .set(bearer(tokens.cfo))
        .expect(200);
      await expect(
        h.sql.query('UPDATE accounting_document SET approved_by = $2 WHERE id = $1', [
          id,
          ids.cfo2,
        ]),
      ).rejects.toThrow(/ACCOUNTING_DOCUMENT_APPROVAL_IS_IMMUTABLE/);
    });

    it('un documento inexistente responde 404', async () => {
      await api()
        .patch(`/api/v1/accounting/documents/${randomUUID()}/approve`)
        .set(bearer(tokens.cfo))
        .expect(404);
    });

    it('aprobar ∥ rechazar a la vez: una gana, la otra 409, un solo estado final', async () => {
      for (let round = 0; round < 5; round += 1) {
        const id = await createDraft(tokens.accountant, 'PENDING');
        const [approve, reject] = await Promise.all([
          api().patch(`/api/v1/accounting/documents/${id}/approve`).set(bearer(tokens.cfo)),
          api().patch(`/api/v1/accounting/documents/${id}/reject`).set(bearer(tokens.cfo2)),
        ]);
        expect([approve.status, reject.status].sort()).toEqual([200, 409]);
        const final = await row(id);
        if (approve.status === 200) {
          expect(final).toMatchObject({
            approval_status: 'APPROVED',
            approved_by: ids.cfo,
            rejected_by: null,
          });
        } else {
          expect(final).toMatchObject({
            approval_status: 'REJECTED',
            rejected_by: ids.cfo2,
            approved_by: null,
          });
        }
        const { rows } = await h.sql.query(
          `SELECT count(*)::int AS n FROM document_audit_log
            WHERE accounting_document_id = $1 AND event_type IN ('APPROVED', 'REJECTED')`,
          [id],
        );
        expect(rows[0].n).toBe(1);
      }
    });
  });

  describe('listado: filtro en la consulta, orden estable y total exacto (ATL-05)', () => {
    let LE1: LegalEntityWorld;
    let LE2: LegalEntityWorld;
    let tokenLE1: string;

    beforeAll(async () => {
      LE1 = await seedLegalEntityWorld(h.sql, shared, 'L1');
      LE2 = await seedLegalEntityWorld(h.sql, shared, 'L2');
      const year = new Date().getUTCFullYear();
      // El único documento de LE1 es ANTIGUO; LE2 tiene 500 más recientes.
      await h.sql.query('UPDATE accounting_document SET document_date = $2 WHERE id = $1', [
        LE1.documentId,
        `${year}-01-01`,
      ]);
      await h.sql.query(
        `INSERT INTO accounting_document (legal_entity_id, source_system, source_type, source_id,
           document_type, document_no, document_date, posting_date, accounting_period_id, ledger_id)
         SELECT $1, 'ATL05', 'SYNTHETIC', gen_random_uuid()::text, 'JOURNAL', 'L2-' || g, $2, $2, $3, $4
           FROM generate_series(1, 500) AS g`,
        [LE2.legalEntityId, today(), LE2.periodId, LE2.ledgerId],
      );
      tokenLE1 = signAccessToken({
        sub: randomUUID(),
        roles: ['ACCOUNTANT'],
        legalEntityIds: [LE1.legalEntityId],
      });
    });

    it('500 documentos recientes de LE2 y uno antiguo de LE1: LE1 ve el suyo y total=1', async () => {
      const res = await api().get('/api/v1/accounting/documents').set(bearer(tokenLE1)).expect(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.items.map((d: { id: string }) => d.id)).toEqual([LE1.documentId]);
      expect(res.body.data).toMatchObject({ page: 1, pageSize: 500 });
    });

    it('ADMIN: total es el COUNT de la población, no el tamaño de la ventana', async () => {
      const { rows } = await h.sql.query('SELECT count(*)::int AS n FROM accounting_document');
      const res = await api()
        .get('/api/v1/accounting/documents')
        .set(bearer(tokens.admin))
        .expect(200);
      expect(rows[0].n).toBeGreaterThan(500);
      expect(res.body.data.total).toBe(rows[0].n);
      expect(res.body.data.items).toHaveLength(500);
    });

    it('páginas sin solapes, en orden fecha DESC, id DESC', async () => {
      const page = async (n: number) =>
        (
          await api()
            .get(`/api/v1/accounting/documents?page=${n}&pageSize=7`)
            .set(bearer(tokens.admin))
            .expect(200)
        ).body.data;
      const [p1, p2] = [await page(1), await page(2)];
      expect(p1).toMatchObject({ page: 1, pageSize: 7 });
      const all = [...p1.items, ...p2.items] as Array<{ id: string; documentDate: string }>;
      expect(new Set(all.map((d) => d.id)).size).toBe(14);
      const { rows } = await h.sql.query(
        `SELECT id FROM accounting_document ORDER BY document_date DESC, id DESC LIMIT 14`,
      );
      expect(all.map((d) => d.id)).toEqual(rows.map((r: { id: string }) => r.id));
    });

    it('pageSize por encima de 500 se rechaza (400)', async () => {
      await api()
        .get('/api/v1/accounting/documents?pageSize=501')
        .set(bearer(tokens.admin))
        .expect(400);
    });
  });
});
