/**
 * P-13 · Aislamiento entre COMERCIOS (A/B) de extremo a extremo (HTTP + PostgreSQL real).
 *
 * El comercio entra con `MERCHANT_ADMIN`, y su alcance sale de sus membresías reales
 * (`atlas_sales.merchant_users`), nunca del cuerpo, la consulta ni una cabecera. Aquí el comercio B
 * pide recursos CONCRETOS del comercio A —por id, en listados, en altas y en descargas— por las
 * rutas del portal y por las rutas compartidas con el staff (`/b2b/onboarding/branches`, `/files`,
 * `/b2b/bnpl`), y se comprueba en la base que no cambió nada.
 */
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { describeWithDatabase } from './support/coverage-integration-db';
import { bootAuthzHttpApp, signAccessToken } from './support/authz-http-app';
import type { AuthzHttpApp } from './support/authz-http-app';
import { seedMerchantWorld } from './support/authz-fixtures';
import type { MerchantWorld } from './support/authz-fixtures';

describeWithDatabase('P-13 aislamiento entre comercios (HTTP + PostgreSQL real)', () => {
  let h: AuthzHttpApp;
  let A: MerchantWorld;
  let B: MerchantWorld;
  let revoked: MerchantWorld;
  let tokens: Record<'merchantA' | 'merchantB' | 'revoked' | 'operations' | 'finance', string>;

  const api = () => request(h.app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const merchantToken = (m: MerchantWorld) =>
    signAccessToken({ sub: m.userId, email: m.email, roles: ['MERCHANT_ADMIN'] });

  beforeAll(async () => {
    h = await bootAuthzHttpApp('authz_merchant');
    A = await seedMerchantWorld(h.sql, 'A');
    B = await seedMerchantWorld(h.sql, 'B');
    revoked = await seedMerchantWorld(h.sql, 'R', 'SUSPENDED');
    tokens = {
      merchantA: merchantToken(A),
      merchantB: merchantToken(B),
      revoked: merchantToken(revoked),
      operations: signAccessToken({ sub: randomUUID(), roles: ['OPERATIONS'] }),
      finance: signAccessToken({ sub: randomUUID(), roles: ['FINANCE'] }),
    };
  }, 180_000);

  afterAll(async () => {
    await h?.close();
  });

  const branchName = async (id: string): Promise<string> =>
    (await h.sql.query('SELECT name FROM atlas_sales.merchant_branches WHERE id = $1', [id]))
      .rows[0].name;

  describe('sucursales por la ruta compartida /b2b/onboarding/branches', () => {
    it('el comercio B no puede renombrar la sucursal del comercio A (403, sin cambios)', async () => {
      const before = await branchName(A.branchId);
      const res = await api()
        .patch(`/api/v1/b2b/onboarding/branches/${A.branchId}`)
        .set(bearer(tokens.merchantB))
        .send({ name: 'Tomada por B' })
        .expect(403);
      expect(res.body.error.code).toBe('MERCHANT_ACCOUNT_FORBIDDEN');
      expect(await branchName(A.branchId)).toBe(before);
    });

    it('el comercio B no puede cerrar la sucursal del comercio A', async () => {
      await api()
        .patch(`/api/v1/b2b/onboarding/branches/${A.branchId}/status`)
        .set(bearer(tokens.merchantB))
        .send({ status: 'INACTIVE' })
        .expect(403);
      const { rows } = await h.sql.query(
        'SELECT status FROM atlas_sales.merchant_branches WHERE id = $1',
        [A.branchId],
      );
      expect(rows[0].status).toBe('ACTIVE');
    });

    it('el comercio B no puede abrir una sucursal en la cuenta del comercio A', async () => {
      const before = await h.sql.query(
        'SELECT count(*)::int AS n FROM atlas_sales.merchant_branches WHERE account_id = $1',
        [A.accountId],
      );
      await api()
        .post('/api/v1/b2b/onboarding/branches')
        .set(bearer(tokens.merchantB))
        .send({ accountId: A.accountId, name: 'Sucursal intrusa', city: 'La Paz' })
        .expect(403);
      const after = await h.sql.query(
        'SELECT count(*)::int AS n FROM atlas_sales.merchant_branches WHERE account_id = $1',
        [A.accountId],
      );
      expect(after.rows[0].n).toBe(before.rows[0].n);
    });

    it('el comercio edita SU sucursal y abre sucursales en SU cuenta (prueba positiva)', async () => {
      await api()
        .patch(`/api/v1/b2b/onboarding/branches/${B.branchId}`)
        .set(bearer(tokens.merchantB))
        .send({ name: 'Sucursal B renovada' })
        .expect(200);
      await api()
        .post('/api/v1/b2b/onboarding/branches')
        .set(bearer(tokens.merchantB))
        .send({ accountId: B.accountId, name: 'Sucursal B2', city: 'Cochabamba' })
        .expect(201);
    });

    it('una sucursal inexistente responde 404', async () => {
      await api()
        .patch(`/api/v1/b2b/onboarding/branches/${randomUUID()}`)
        .set(bearer(tokens.merchantB))
        .send({ name: 'Nada' })
        .expect(404);
    });

    it('OPERATIONS (staff) sigue operando la sucursal de cualquier comercio', async () => {
      await api()
        .patch(`/api/v1/b2b/onboarding/branches/${A.branchId}`)
        .set(bearer(tokens.operations))
        .send({ city: 'Tarija' })
        .expect(200);
    });

    it('un comercio con la membresía suspendida no opera ni su propia sucursal', async () => {
      await api()
        .patch(`/api/v1/b2b/onboarding/branches/${revoked.branchId}`)
        .set(bearer(tokens.revoked))
        .send({ name: 'Revocada' })
        .expect(403);
    });
  });

  describe('portal del comercio', () => {
    it('GET /portal/scope sólo devuelve la cuenta propia', async () => {
      const res = await api().get('/api/v1/portal/scope').set(bearer(tokens.merchantB)).expect(200);
      const body = JSON.stringify(res.body);
      expect(body).toContain(B.accountId);
      expect(body).not.toContain(A.accountId);
    });

    it('el panel de facturación de otro comercio responde 403 aunque se pida por consulta', async () => {
      await api()
        .get(`/api/v1/portal/billing?merchantAccountId=${A.accountId}`)
        .set(bearer(tokens.merchantB))
        .expect(403);
    });

    it('editar la sucursal de otro comercio desde el portal no la cambia', async () => {
      const before = await branchName(A.branchId);
      const res = await api()
        .patch(`/api/v1/portal/branches/${A.branchId}`)
        .set(bearer(tokens.merchantB))
        .send({ name: 'Portal intruso' });
      expect([403, 404]).toContain(res.status);
      expect(await branchName(A.branchId)).toBe(before);
    });

    it('descargar una factura que no es del comercio responde 404', async () => {
      await api()
        .get(`/api/v1/portal/billing/invoices/${randomUUID()}`)
        .set(bearer(tokens.merchantB))
        .expect(404);
    });

    it('la membresía suspendida no ve el portal (falla cerrado)', async () => {
      const res = await api().get('/api/v1/portal/scope').set(bearer(tokens.revoked)).expect(403);
      expect(res.body.error.code).toBe('PORTAL_SCOPE_NOT_PROVISIONED');
    });

    const purchaseBody = (extra: Record<string, unknown>) => ({
      consumerExternalRef: 'CI-SINTETICA-0001',
      purchaseAmount: '100.00',
      downPaymentAmount: '60.00',
      financedAmount: '40.00',
      mdrReceivableDueDate: '2030-01-31',
      installments: [{ installmentNumber: 1, dueDate: '2030-01-31', amount: '40.00' }],
      ...extra,
    });
    const purchasesOf = async (accountId: string): Promise<number> =>
      (
        await h.sql.query(
          'SELECT count(*)::int AS n FROM atlas_sales.bnpl_purchases WHERE merchant_account_id = $1',
          [accountId],
        )
      ).rows[0].n;

    it('registrar una compra BNPL a nombre de otro comercio responde 403', async () => {
      await api()
        .post('/api/v1/b2b/bnpl/purchases')
        .set(bearer(tokens.merchantB))
        .send(purchaseBody({ merchantAccountId: A.accountId, branchId: A.branchId }))
        .expect(403);
      expect(await purchasesOf(A.accountId)).toBe(0);
    });

    it('una compra de B en la sucursal de A (id ajeno en el cuerpo) no se registra', async () => {
      const res = await api()
        .post('/api/v1/b2b/bnpl/purchases')
        .set(bearer(tokens.merchantB))
        .send(purchaseBody({ branchId: A.branchId }));
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(await purchasesOf(A.accountId)).toBe(0);
      expect(await purchasesOf(B.accountId)).toBe(0);
    });
  });

  describe('adjuntos /files (documentos KYB)', () => {
    it('el comercio B no lista los archivos de la cuenta del comercio A', async () => {
      const res = await api()
        .get(`/api/v1/files?ownerType=B2B_ACCOUNT&ownerId=${A.accountId}`)
        .set(bearer(tokens.merchantB))
        .expect(403);
      expect(res.body.error.code).toBe('ERP_FILE_FORBIDDEN');
    });

    it('el comercio B no lee los metadatos del archivo del comercio A', async () => {
      await api().get(`/api/v1/files/${A.fileId}`).set(bearer(tokens.merchantB)).expect(403);
    });

    it('el comercio B no descarga el archivo del comercio A', async () => {
      await api()
        .get(`/api/v1/files/${A.fileId}/content`)
        .set(bearer(tokens.merchantB))
        .expect(403);
    });

    it('el comercio B no da de baja el archivo del comercio A (sigue ACTIVE)', async () => {
      await api().delete(`/api/v1/files/${A.fileId}`).set(bearer(tokens.merchantB)).expect(403);
      const { rows } = await h.sql.query(
        'SELECT status FROM atlas_accounting.erp_file WHERE id = $1',
        [A.fileId],
      );
      expect(rows[0].status).toBe('ACTIVE');
    });

    it('un comercio no alcanza adjuntos de la contabilidad interna', async () => {
      await api()
        .get(`/api/v1/files?ownerType=GL_ACCOUNT&ownerId=${randomUUID()}`)
        .set(bearer(tokens.merchantB))
        .expect(403);
    });

    it('un comercio no pide permiso de subida para la cuenta de otro', async () => {
      await api()
        .post('/api/v1/files/upload-signature')
        .set(bearer(tokens.merchantB))
        .send({
          ownerType: 'B2B_ACCOUNT',
          ownerId: A.accountId,
          contentType: 'application/pdf',
          sizeBytes: 10,
        })
        .expect(403);
    });

    it('el comercio lista y lee SUS archivos; un id inexistente da 404 (prueba positiva)', async () => {
      const res = await api()
        .get(`/api/v1/files?ownerType=B2B_ACCOUNT&ownerId=${B.accountId}`)
        .set(bearer(tokens.merchantB))
        .expect(200);
      expect((res.body.data as Array<{ id: string }>).map((f) => f.id)).toEqual([B.fileId]);
      await api().get(`/api/v1/files/${B.fileId}`).set(bearer(tokens.merchantB)).expect(200);
      await api().get(`/api/v1/files/${randomUUID()}`).set(bearer(tokens.merchantB)).expect(404);
    });

    it('el staff (FINANCE) sigue viendo los archivos de cualquier comercio', async () => {
      await api()
        .get(`/api/v1/files?ownerType=B2B_ACCOUNT&ownerId=${A.accountId}`)
        .set(bearer(tokens.finance))
        .expect(200);
    });
  });

  describe('rol sin permiso sobre rutas financieras del staff', () => {
    it.each([
      ['GET', '/api/v1/b2b/coverage/payables'],
      ['GET', '/api/v1/b2b/billing/invoices'],
      ['GET', '/api/v1/accounting/outbox/events/dead'],
      ['GET', '/api/v1/b2b/receivables'],
      ['GET', '/api/v1/audit/business-actions'],
    ])('MERCHANT_ADMIN en %s %s responde 403', async (_method, path) => {
      await api().get(path).set(bearer(tokens.merchantA)).expect(403);
    });

    it('COLLECTIONS no liquida coberturas (sólo FINANCE/ADMIN)', async () => {
      const token = signAccessToken({ sub: randomUUID(), roles: ['COLLECTIONS'] });
      await api()
        .patch(`/api/v1/b2b/coverage/payables/${randomUUID()}/paid`)
        .set(bearer(token))
        .send({})
        .expect(403);
    });

    it('OPERATIONS no reenvía eventos del outbox contable', async () => {
      await api()
        .post('/api/v1/accounting/outbox/events/cualquiera/replay')
        .set(bearer(tokens.operations))
        .send({ reason: 'prueba P-13' })
        .expect(403);
    });
  });
});
