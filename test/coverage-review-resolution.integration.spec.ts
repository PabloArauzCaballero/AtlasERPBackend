/**
 * P-04 · La cola de revisión de cobertura se RESUELVE — contra PostgreSQL real y migrado.
 *
 * Hasta el 2026-09-24 la cola `coverage_review_items` sólo se abría: un aviso de pago REPORTED que
 * nadie verificó quedaba ahí para siempre y la cuota ni se daba por pagada ni se podía cubrir.
 * Aquí se prueba la resolución con doble criterio (estado bajo lock + otra persona) y auditoría:
 * confirmar el aviso, rechazarlo (y que la cuota vuelva a ser cubrible), descartar un contrato no
 * activo, la carrera entre dos resoluciones, el rol sin permiso y la historia inmutable.
 *
 *   ERP_INTEGRATION_DATABASE_URL=postgres://usuario:clave@host:puerto/postgres \
 *     yarn test:integration test/coverage-review-resolution.integration.spec.ts
 */
import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { addDays, businessDate } from '../src/common/time/business-date';
import { RolesGuard } from '../src/common/guards/roles.guard';
import type { PinoLoggerService } from '../src/common/logging/pino-logger.service';
import type { AuthUser } from '../src/common/types/auth-context.types';
import { resolveCoverageReviewItemSchema } from '../src/modules/b2b-sales-crm/b2b-sales-crm.schemas';
import { CoverageController } from '../src/modules/b2b-sales-crm/controllers/coverage.controller';
import { createMigratedDatabase, describeWithDatabase } from './support/coverage-integration-db';
import type { MigratedDatabase } from './support/coverage-integration-db';
import {
  addEvidenceFile,
  addNotice,
  buildCoverageHarness,
  one,
  seedPurchase,
} from './support/coverage-fixtures';
import type { CoverageHarness, SeededPurchase } from './support/coverage-fixtures';

const REQUESTER = { userId: '11111111-1111-4111-8111-111111111111' };
const REVIEWER = { userId: '55555555-5555-4555-8555-555555555555' };
const REVIEWER_2 = { userId: '66666666-6666-4666-8666-666666666666' };
const TODAY = businessDate();
const PAST = addDays(TODAY, -5);
/** Un aviso reportado hace 100 h: fuera del plazo de verificación (72 h por defecto). */
const STALE = () => new Date(Date.now() - 100 * 3_600_000);

describe('permisos de la resolución de la cola (guardia de roles real)', () => {
  const silent = { debugContext: jest.fn(), warnContext: jest.fn() };
  const guard = new RolesGuard(new Reflector(), silent as unknown as PinoLoggerService);
  const contextFor = (user: AuthUser): ExecutionContext =>
    ({
      getHandler: () => CoverageController.prototype.resolveReviewItem,
      getClass: () => CoverageController,
      switchToHttp: () => ({ getRequest: () => ({ user, headers: {} }) }),
    }) as unknown as ExecutionContext;

  it('rol sin permiso recibe 403 al resolver un elemento de la cola', () => {
    for (const role of ['OPERATIONS', 'COLLECTIONS', 'SALES']) {
      expect(() => guard.canActivate(contextFor({ sub: REVIEWER.userId, role }))).toThrow(
        ForbiddenException,
      );
    }
    expect(guard.canActivate(contextFor({ sub: REVIEWER.userId, role: 'FINANCE' }))).toBe(true);
  });

  it('el motivo es obligatorio en toda resolución', () => {
    for (const action of ['CONFIRM_NOTICE', 'REJECT_NOTICE', 'DISMISS']) {
      expect(resolveCoverageReviewItemSchema.safeParse({ action }).success).toBe(false);
      expect(resolveCoverageReviewItemSchema.safeParse({ action, note: ' ' }).success).toBe(false);
    }
    expect(
      resolveCoverageReviewItemSchema.safeParse({ action: 'APPROVE', note: 'verificado' }).success,
    ).toBe(false);
  });
});

describeWithDatabase('P-04 resolución de la cola de revisión (PostgreSQL real)', () => {
  let db: MigratedDatabase;
  let h: CoverageHarness;

  beforeAll(async () => {
    db = await createMigratedDatabase('cov_review');
    h = await buildCoverageHarness(db.url);
  }, 120_000);

  afterAll(async () => {
    await h?.close();
    await db?.drop();
  });

  const schedule = (installmentId: string, actor = REQUESTER) =>
    h.coverage.scheduleCoverage(
      {
        installmentId,
        scheduledPaymentDate: TODAY,
        reason: 'CUSTOMER_INSTALLMENT_DEFAULT_COVERAGE',
      },
      actor,
    );

  /** Cuota vencida con un aviso REPORTED viejo; el barrido la manda a la cola. */
  async function staleNotice(amount = '300.00', noticeAmount = amount) {
    const p = await seedPurchase(h.sequelize, { installments: [{ dueDate: PAST, amount }] });
    const installmentId = p.installments[0]!.id;
    const noticeId = await addNotice(h.sequelize, p, installmentId, {
      status: 'REPORTED',
      amount: noticeAmount,
      createdAt: STALE(),
    });
    await h.sweep.sweep(undefined, { noticeReviewHours: 72 });
    const item = await openItem(installmentId, 'PAYMENT_NOTICE_UNRESOLVED');
    return { p, installmentId, noticeId, itemId: item.id };
  }

  async function openItem(installmentId: string, reason: string) {
    return one<{ id: string }>(
      h.sequelize,
      `SELECT id FROM atlas_sales.coverage_review_items
        WHERE installment_id = $1 AND reason = $2 AND status = 'OPEN'`,
      [installmentId, reason],
    );
  }

  const itemRow = (id: string) =>
    one<{
      status: string;
      resolution: string | null;
      resolved_by_user_id: string | null;
      resolved_at: Date | null;
      resolution_note: string | null;
    }>(
      h.sequelize,
      `SELECT status, resolution, resolved_by_user_id, resolved_at, resolution_note
         FROM atlas_sales.coverage_review_items WHERE id = $1`,
      [id],
    );
  const noticeRow = (id: string) =>
    one<{ status: string; decided_by_user_id: string | null; decision_note: string | null }>(
      h.sequelize,
      `SELECT status, decided_by_user_id, decision_note
         FROM atlas_sales.consumer_payments_to_merchant WHERE id = $1`,
      [id],
    );
  const installmentStatus = async (id: string) =>
    (
      await one<{ status: string }>(
        h.sequelize,
        'SELECT status FROM atlas_sales.bnpl_installments WHERE id = $1',
        [id],
      )
    ).status;

  it('confirmar el aviso deja el pago CONFIRMED, la cuota pagada y el elemento cerrado con actor, motivo y fecha', async () => {
    const s = await staleNotice();

    const result = await h.review.resolveReviewItem(
      s.itemId,
      { action: 'CONFIRM_NOTICE', note: 'Transferencia verificada con el comercio' },
      REVIEWER,
    );

    expect(result).toMatchObject({
      outcome: 'NOTICE_CONFIRMED',
      closedReviewItemIds: [s.itemId],
      installment: { status: 'PAID_TO_MERCHANT', confirmedPaidAmount: '300.00', balance: '0.00' },
    });
    expect(await noticeRow(s.noticeId)).toMatchObject({
      status: 'CONFIRMED',
      decided_by_user_id: REVIEWER.userId,
      decision_note: 'Transferencia verificada con el comercio',
    });
    const item = await itemRow(s.itemId);
    expect(item).toMatchObject({
      status: 'RESOLVED',
      resolution: 'NOTICE_CONFIRMED',
      resolved_by_user_id: REVIEWER.userId,
      resolution_note: 'Transferencia verificada con el comercio',
    });
    expect(item.resolved_at).not.toBeNull();
    expect(await installmentStatus(s.installmentId)).toBe('PAID_TO_MERCHANT');
    // Ya pagada: no hay nada que cubrir, y el elemento cerrado no vuelve a la cola.
    await expect(schedule(s.installmentId)).rejects.toBeInstanceOf(ConflictException);
    const queue = await h.review.listReviewQueue(REVIEWER);
    expect(queue.some((row) => row.id === s.itemId)).toBe(false);
    const closed = await h.review.listReviewQueue(REVIEWER, { status: 'RESOLVED' });
    expect(closed.find((row) => row.id === s.itemId)).toMatchObject({
      resolution: 'NOTICE_CONFIRMED',
      allowedActions: [],
    });
  });

  it('confirmar un aviso parcial descuenta del saldo y la cobertura se programa por el resto', async () => {
    const s = await staleNotice('300.00', '100.00');

    const result = await h.review.resolveReviewItem(
      s.itemId,
      { action: 'CONFIRM_NOTICE', note: 'Pago parcial verificado' },
      REVIEWER,
    );

    expect(result).toMatchObject({
      installment: { status: 'OVERDUE', confirmedPaidAmount: '100.00', balance: '200.00' },
    });
    expect(await schedule(s.installmentId)).toMatchObject({
      outcome: 'SCHEDULED',
      amount: '200.00',
    });
  });

  it('rechazar el aviso con motivo deja la cuota elegible para cobertura', async () => {
    const s = await staleNotice();
    // Mientras el aviso está pendiente, la cobertura va a revisión, no se programa.
    expect(await schedule(s.installmentId)).toMatchObject({ outcome: 'REVIEW_REQUIRED' });

    const result = await h.review.resolveReviewItem(
      s.itemId,
      { action: 'REJECT_NOTICE', note: 'El comercio no recibió el dinero' },
      REVIEWER,
    );

    expect(result).toMatchObject({ outcome: 'NOTICE_REJECTED' });
    // Se cierran las dos revisiones de aviso de la cuota: la del barrido y la de la cobertura.
    expect((result.closedReviewItemIds as string[]).length).toBe(2);
    expect(await noticeRow(s.noticeId)).toMatchObject({
      status: 'REJECTED',
      decided_by_user_id: REVIEWER.userId,
    });
    expect(await installmentStatus(s.installmentId)).toBe('OVERDUE');
    expect(await schedule(s.installmentId, REVIEWER_2)).toMatchObject({
      outcome: 'SCHEDULED',
      amount: '300.00',
    });
  });

  it('dos resoluciones concurrentes del mismo elemento: sólo una gana', async () => {
    const s = await staleNotice();

    const results = await Promise.allSettled([
      h.review.resolveReviewItem(
        s.itemId,
        { action: 'CONFIRM_NOTICE', note: 'verificado por A' },
        REVIEWER,
      ),
      h.review.resolveReviewItem(
        s.itemId,
        { action: 'REJECT_NOTICE', note: 'rechazado por B' },
        REVIEWER_2,
      ),
    ]);

    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0]!.reason).toBeInstanceOf(ConflictException);
    expect((lost[0]!.reason as ConflictException).getResponse()).toMatchObject({
      code: 'REVIEW_ITEM_ALREADY_RESOLVED',
    });
    const winner = (won[0] as PromiseFulfilledResult<Record<string, unknown>>).value;
    const notice = await noticeRow(s.noticeId);
    expect(notice.status).toBe(winner.outcome === 'NOTICE_CONFIRMED' ? 'CONFIRMED' : 'REJECTED');
    expect(
      await one<{ n: string }>(
        h.sequelize,
        `SELECT count(*)::text AS n FROM atlas_sales.coverage_review_items
          WHERE installment_id = $1 AND status = 'RESOLVED'`,
        [s.installmentId],
      ),
    ).toEqual({ n: '1' });
  });

  it('quien pidió la cobertura no resuelve su propia revisión; otra persona sí', async () => {
    const p = await seedPurchase(h.sequelize, {
      installments: [{ dueDate: PAST, amount: '300.00' }],
    });
    const installmentId = p.installments[0]!.id;
    await addNotice(h.sequelize, p, installmentId, { status: 'REPORTED', amount: '300.00' });
    await schedule(installmentId, REQUESTER);
    const item = await openItem(installmentId, 'COVERAGE_WITH_PENDING_NOTICE');

    const mine = await h.review.listReviewQueue(REQUESTER);
    const theirs = await h.review.listReviewQueue(REVIEWER);
    expect(mine.find((row) => row.id === item.id)).toMatchObject({
      openedByMe: true,
      allowedActions: [],
    });
    expect(theirs.find((row) => row.id === item.id)).toMatchObject({
      openedByMe: false,
      allowedActions: ['CONFIRM_NOTICE', 'REJECT_NOTICE'],
      pendingNotices: [expect.objectContaining({ amount: '300.00', status: 'REPORTED' })],
    });

    await expect(
      h.review.resolveReviewItem(item.id, { action: 'REJECT_NOTICE', note: 'no' }, REQUESTER),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect((await itemRow(item.id)).status).toBe('OPEN');

    await expect(
      h.review.resolveReviewItem(
        item.id,
        { action: 'REJECT_NOTICE', note: 'sin respaldo' },
        REVIEWER,
      ),
    ).resolves.toMatchObject({ outcome: 'NOTICE_REJECTED' });
  });

  it('descarta con motivo una cobertura en revisión por contrato no activo; un aviso pendiente no se descarta', async () => {
    const p = await seedPurchase(h.sequelize, {
      installments: [{ dueDate: PAST, amount: '300.00' }],
      contractStatus: 'SUSPENDED',
    });
    const installmentId = p.installments[0]!.id;
    expect(await schedule(installmentId)).toMatchObject({
      outcome: 'REVIEW_REQUIRED',
      reason: 'CONTRACT_NOT_ACTIVE',
    });
    const item = await openItem(installmentId, 'CONTRACT_NOT_ACTIVE');

    await expect(
      h.review.resolveReviewItem(item.id, { action: 'CONFIRM_NOTICE', note: 'x-x' }, REVIEWER),
    ).rejects.toBeInstanceOf(ConflictException);
    const result = await h.review.resolveReviewItem(
      item.id,
      { action: 'DISMISS', note: 'Contrato suspendido: no corresponde cubrir' },
      REVIEWER,
    );
    expect(result).toMatchObject({ outcome: 'DISMISSED', closedReviewItemIds: [item.id] });
    expect(await itemRow(item.id)).toMatchObject({
      status: 'RESOLVED',
      resolution: 'DISMISSED',
      resolved_by_user_id: REVIEWER.userId,
    });
    expect(await installmentStatus(installmentId)).toBe('SCHEDULED');

    const s = await staleNotice();
    await expect(
      h.review.resolveReviewItem(s.itemId, { action: 'DISMISS', note: 'no aplica' }, REVIEWER),
    ).rejects.toMatchObject({ response: { code: 'REVIEW_ACTION_NOT_ALLOWED' } });
    expect(await noticeRow(s.noticeId)).toMatchObject({ status: 'REPORTED' });
  });

  it('no confirma un aviso sobre una cuota ya cubierta por Atlas (doble beneficio)', async () => {
    const p = await seedPurchase(h.sequelize, {
      installments: [{ dueDate: PAST, amount: '300.00' }],
    });
    const installmentId = p.installments[0]!.id;
    await schedule(installmentId);
    const noticeId = await addNotice(h.sequelize, p, installmentId, {
      status: 'REPORTED',
      amount: '300.00',
      createdAt: STALE(),
    });
    await h.sweep.sweep(undefined, { noticeReviewHours: 72 });
    const item = await openItem(installmentId, 'PAYMENT_NOTICE_UNRESOLVED');

    await expect(
      h.review.resolveReviewItem(item.id, { action: 'CONFIRM_NOTICE', note: 'pagó' }, REVIEWER),
    ).rejects.toMatchObject({ response: { code: 'COVERAGE_IN_PLACE' } });
    expect(await noticeRow(noticeId)).toMatchObject({ status: 'REPORTED' });
    expect((await itemRow(item.id)).status).toBe('OPEN');
  });

  it('un elemento cerrado no se borra ni se edita', async () => {
    const s = await staleNotice();
    await h.review.resolveReviewItem(
      s.itemId,
      { action: 'REJECT_NOTICE', note: 'sin respaldo' },
      REVIEWER,
    );

    await expect(
      h.sequelize.query('DELETE FROM atlas_sales.coverage_review_items WHERE id = $1', {
        bind: [s.itemId],
      }),
    ).rejects.toThrow(/no se borra/);
    await expect(
      h.sequelize.query(
        "UPDATE atlas_sales.coverage_review_items SET status = 'OPEN', resolution = NULL WHERE id = $1",
        { bind: [s.itemId] },
      ),
    ).rejects.toThrow(/ya está cerrado/);
    await expect(
      h.review.resolveReviewItem(
        s.itemId,
        { action: 'CONFIRM_NOTICE', note: 'otra vez' },
        REVIEWER_2,
      ),
    ).rejects.toMatchObject({ response: { code: 'REVIEW_ITEM_ALREADY_RESOLVED' } });
  });

  describe('listados que la pantalla necesita (aditivos)', () => {
    let p: SeededPurchase;
    let payableId: string;

    beforeAll(async () => {
      p = await seedPurchase(h.sequelize, { installments: [{ dueDate: PAST, amount: '300.00' }] });
      payableId = (await schedule(p.installments[0]!.id)).id as string;
    });

    it('las coberturas traen el estado de la liquidación, quién la registró y la moneda', async () => {
      const before = (await h.reconciliation.listPayables(REVIEWER.userId)).find(
        (row) => row.id === payableId,
      );
      expect(before).toMatchObject({
        currency: 'BOB',
        settlementStatus: null,
        settlementRegisteredByMe: false,
      });

      const evidenceFileId = await addEvidenceFile(h.sequelize, payableId);
      await h.coverage.markPayablePaid(
        payableId,
        {
          settlementReference: `LIQ-LIST-${Date.now()}`,
          amount: '300.00',
          currency: 'BOB',
          beneficiaryAccountId: p.merchantAccountId,
          paidAt: new Date(Date.now() - 60_000),
          evidenceFileId,
        },
        REQUESTER,
      );

      const forRegistrar = (await h.reconciliation.listPayables(REQUESTER.userId)).find(
        (row) => row.id === payableId,
      );
      const forOther = (await h.reconciliation.listPayables(REVIEWER.userId)).find(
        (row) => row.id === payableId,
      );
      expect(forRegistrar).toMatchObject({
        settlementStatus: 'PENDING_APPROVAL',
        settlementRegisteredByUserId: REQUESTER.userId,
        settlementRegisteredByMe: true,
        settlementCurrency: 'BOB',
      });
      expect(forOther).toMatchObject({
        settlementStatus: 'PENDING_APPROVAL',
        settlementRegisteredByMe: false,
      });
    });

    it('las recuperaciones traen su moneda', async () => {
      await h.coverage.approvePayableSettlement(payableId, {}, REVIEWER);
      const recovery = (await h.reconciliation.listRecoveries()).find(
        (row) => row.merchantPayableId === payableId,
      );
      expect(recovery).toMatchObject({ currency: 'BOB', amountCoveredByAtlas: '300.00' });
    });
  });
});
