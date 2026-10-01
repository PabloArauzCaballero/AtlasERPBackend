/**
 * ATL-03 · Aprobación del documento contable decidida por el servidor, y ATL-05 · listado filtrado
 * por entidad EN LA CONSULTA con total exacto. HTTP completo (guardas reales) + PostgreSQL migrado.
 *
 * DEC-10 sigue sin decidir: la política que usa esta suite (ALL_MANUAL_REQUIRE_APPROVAL, sin umbrales) es
 * un FIXTURE de la opción conservadora, no una política aprobada por finanzas. Aquí se prueba el
 * MECANISMO: el servidor decide la necesidad de aprobación; el cliente no se exime; sin política no se
 * crea; aprueba o rechaza un CFO/ADMIN distinto del creador; PENDING, REJECTED, un APPROVED sin
 * aprobador y un NOT_REQUIRED sin política registrada no se publican.
 */
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import type { Env } from '../src/config/env';
import { describeWithDatabase } from './support/coverage-integration-db';
import { bootAuthzHttpApp, signAccessToken } from './support/authz-http-app';
import type { AuthzHttpApp } from './support/authz-http-app';
import { seedLegalEntityWorld, seedSharedAccounting } from './support/authz-fixtures';
import type { LegalEntityWorld, SharedAccounting } from './support/authz-fixtures';

describeWithDatabase('ATL-03 / ATL-05 aprobación y listado de documentos contables', () => {
  let h: AuthzHttpApp;
  let shared: SharedAccounting;
  let A: LegalEntityWorld;
  let env: Env;
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
      `SELECT status, approval_status, approval_policy_ref, approved_by, approved_at, rejected_by, rejected_at
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
    // `env` se evalúa al importarlo: hay que traerlo DESPUÉS de que el arnés apunte a su base.
    ({ env } = await import('../src/config/env'));
    // Política FIXTURE (opción conservadora de DEC-10), no una política aprobada. Las pruebas de
    // «sin política» la retiran y la restauran en su propio bloque.
    env.ACCOUNTING_APPROVAL_POLICY = 'ALL_MANUAL_REQUIRE_APPROVAL';
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

  async function documentCount(): Promise<number> {
    const { rows } = await h.sql.query('SELECT count(*)::int AS n FROM accounting_document');
    return rows[0].n as number;
  }

  describe('alta: el servidor decide, el cliente no se exime ni se autocertifica', () => {
    it('AP-06 approvalStatus APPROVED en el cuerpo responde 422 y no escribe nada', async () => {
      const before = await documentCount();
      const res = await api()
        .post('/api/v1/accounting/documents')
        .set(bearer(tokens.admin))
        .send(draft('APPROVED'))
        .expect(422);
      expect(res.body.error.code).toBe('ACCOUNTING_DOCUMENT_APPROVAL_NOT_CLIENT_SETTABLE');
      expect(await documentCount()).toBe(before);
    });

    it('AP-06 REJECTED en el cuerpo también es 422', async () => {
      await api()
        .post('/api/v1/accounting/documents')
        .set(bearer(tokens.accountant))
        .send(draft('REJECTED'))
        .expect(422);
    });

    it('AP-04 sin approvalStatus queda PENDING con la política registrada, y no se publica hasta que otro apruebe', async () => {
      const id = await createDraft(tokens.accountant);
      expect(await row(id)).toMatchObject({
        approval_status: 'PENDING',
        approval_policy_ref: 'ALL_MANUAL_REQUIRE_APPROVAL@1',
      });
      const { rows } = await h.sql.query(
        `SELECT event_payload FROM document_audit_log
          WHERE accounting_document_id = $1 AND event_type = 'DRAFT_CREATED'`,
        [id],
      );
      expect(rows[0].event_payload.approval).toMatchObject({
        status: 'PENDING',
        policyRef: 'ALL_MANUAL_REQUIRE_APPROVAL@1',
      });
      const res = await api()
        .patch(`/api/v1/accounting/documents/${id}/post`)
        .set(bearer(tokens.accountant))
        .expect(409);
      expect(res.body.error.code).toBe('ACCOUNTING_DOCUMENT_APPROVAL_REQUIRED');
    });

    it('AP-05 pedir NOT_REQUIRED NO da la exención: 422 y cero documentos', async () => {
      const before = await documentCount();
      const res = await api()
        .post('/api/v1/accounting/documents')
        .set(bearer(tokens.admin))
        .send(draft('NOT_REQUIRED'))
        .expect(422);
      expect(res.body.error.code).toBe('ACCOUNTING_DOCUMENT_APPROVAL_STATUS_CONTRADICTS_POLICY');
      expect(await documentCount()).toBe(before);
    });

    it('AP-19 declarar sourceSystem SYSTEM / sourceType de integración en el cuerpo no concede la exención', async () => {
      const res = await api()
        .post('/api/v1/accounting/documents')
        .set(bearer(tokens.accountant))
        .send({ ...draft(), sourceSystem: 'SYSTEM', sourceType: 'REVERSAL' })
        .expect(201);
      expect((await row(res.body.data.document.id)).approval_status).toBe('PENDING');
    });

    it('AP-18 lote: un ítem que pide NOT_REQUIRED rechaza TODO el lote sin escribir; sin el campo, todos PENDING', async () => {
      const before = await documentCount();
      const item = (n: number, approvalStatus?: string) => ({
        ...draft(approvalStatus),
        sourceSystem: 'TEST',
        sourceType: 'BULK',
        sourceId: `AP18-${n}-${randomUUID()}`,
      });
      await api()
        .post('/api/v1/accounting/documents/bulk')
        .set(bearer(tokens.accountant))
        .send({ items: [item(1), item(2, 'NOT_REQUIRED')] })
        .expect(422);
      expect(await documentCount()).toBe(before);
      const ok = await api()
        .post('/api/v1/accounting/documents/bulk')
        .set(bearer(tokens.accountant))
        .send({ items: [item(3), item(4)] })
        .expect(201);
      const created = ok.body.data.documents as Array<{ id: string }>;
      expect(created).toHaveLength(2);
      for (const doc of created) expect((await row(doc.id)).approval_status).toBe('PENDING');
    });

    it('AP-08 sin política configurada no se crea nada (409 controlado), sea cual sea el cuerpo', async () => {
      const configured = env.ACCOUNTING_APPROVAL_POLICY;
      env.ACCOUNTING_APPROVAL_POLICY = undefined;
      try {
        const before = await documentCount();
        for (const approvalStatus of [undefined, 'NOT_REQUIRED', 'PENDING']) {
          const res = await api()
            .post('/api/v1/accounting/documents')
            .set(bearer(tokens.admin))
            .send(draft(approvalStatus))
            .expect(409);
          expect(res.body.error.code).toBe('ACCOUNTING_APPROVAL_POLICY_UNAVAILABLE');
        }
        expect(await documentCount()).toBe(before);
      } finally {
        env.ACCOUNTING_APPROVAL_POLICY = configured;
      }
    });

    it('AP-07 el reverso (generado por el servidor) nace exento por la regla del servidor y se publica', async () => {
      const id = await createDraft(tokens.accountant);
      await api()
        .patch(`/api/v1/accounting/documents/${id}/approve`)
        .set(bearer(tokens.cfo))
        .expect(200);
      await api()
        .patch(`/api/v1/accounting/documents/${id}/post`)
        .set(bearer(tokens.accountant))
        .expect(200);
      const res = await api()
        .post(`/api/v1/accounting/documents/${id}/reverse`)
        .set(bearer(tokens.cfo))
        .send({ reversalDate: today(), reason: 'prueba AP-07' });
      expect(res.status).toBeLessThan(300);
      const { rows } = await h.sql.query(
        `SELECT status, approval_status, approval_policy_ref FROM accounting_document
          WHERE reversal_of_id = $1`,
        [id],
      );
      expect(rows[0]).toMatchObject({
        status: 'POSTED',
        approval_status: 'NOT_REQUIRED',
        approval_policy_ref: 'SERVER_GENERATED_DOCUMENT@1',
      });
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

    it('REJECTED → post 409 y sigue en DRAFT; y no se puede aprobar después (AP-15)', async () => {
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
      const again = await api()
        .patch(`/api/v1/accounting/documents/${id}/approve`)
        .set(bearer(tokens.cfo2))
        .expect(409);
      expect(again.body.error.code).toBe('ACCOUNTING_DOCUMENT_NOT_PENDING_APPROVAL');
      expect(await row(id)).toMatchObject({
        status: 'DRAFT',
        approval_status: 'REJECTED',
        approved_by: null,
      });
      expect(await journalCount(id, 'POSTED')).toBe(0);
    });

    it('AP-12 un APPROVED sin aprobador registrado (autocertificado de antes) no se publica', async () => {
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

    it('AP-21 un borrador NOT_REQUIRED sin política registrada (anterior a ATL-03) no se publica ni se fabrica una aprobación', async () => {
      const { rows } = await h.sql.query(
        `INSERT INTO accounting_document (legal_entity_id, source_system, source_type, source_id,
           document_type, document_no, document_date, posting_date, accounting_period_id, ledger_id,
           approval_status)
         VALUES ($1, 'LEGACY', 'SYNTHETIC', gen_random_uuid()::text, 'JOURNAL', $2, $3, $3, $4, $5, 'NOT_REQUIRED')
         RETURNING id`,
        [A.legalEntityId, `LEG-${randomUUID().slice(0, 8)}`, today(), A.periodId, A.ledgerId],
      );
      const id = rows[0].id as string;
      const res = await api()
        .patch(`/api/v1/accounting/documents/${id}/post`)
        .set(bearer(tokens.admin))
        .expect(409);
      expect(res.body.error.code).toBe('ACCOUNTING_DOCUMENT_APPROVAL_POLICY_MISSING');
      expect(await row(id)).toMatchObject({ status: 'DRAFT', approved_by: null });
    });

    it('AP-13 dos publicaciones simultáneas: un solo efecto contable, la otra 409', async () => {
      const id = await createDraft(tokens.accountant);
      await api()
        .patch(`/api/v1/accounting/documents/${id}/approve`)
        .set(bearer(tokens.cfo))
        .expect(200);
      const [one, two] = await Promise.all([
        api().patch(`/api/v1/accounting/documents/${id}/post`).set(bearer(tokens.accountant)),
        api().patch(`/api/v1/accounting/documents/${id}/post`).set(bearer(tokens.accountant)),
      ]);
      expect([one.status, two.status].sort()).toEqual([200, 409]);
      expect(await journalCount(id, 'POSTED')).toBe(1);
      const { rows } = await h.sql.query(
        `SELECT count(*)::int AS n FROM event_outbox
          WHERE event_key = $1`,
        [`accounting-document-posted-${id}`],
      );
      expect(rows[0].n).toBe(1);
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

    it('AP-09 el creador no aprueba lo suyo ni con un JWT renovado de la misma identidad', async () => {
      const id = await createDraft(tokens.cfo, 'PENDING');
      const renewed = signAccessToken({
        sub: ids.cfo,
        roles: ['CFO'],
        legalEntityIds: [A.legalEntityId],
      });
      const res = await api()
        .patch(`/api/v1/accounting/documents/${id}/approve`)
        .set(bearer(renewed))
        .expect(403);
      expect(res.body.error.code).toBe('ACCOUNTING_DOCUMENT_SELF_APPROVAL_FORBIDDEN');
      expect((await row(id)).approval_status).toBe('PENDING');
    });

    it('AP-10 un CFO sin alcance sobre la entidad del documento recibe 403 y no decide', async () => {
      const id = await createDraft(tokens.accountant, 'PENDING');
      const foreign = signAccessToken({
        sub: randomUUID(),
        roles: ['CFO'],
        legalEntityIds: [randomUUID()],
      });
      await api()
        .patch(`/api/v1/accounting/documents/${id}/approve`)
        .set(bearer(foreign))
        .expect(403);
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
