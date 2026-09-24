/**
 * P-04 · Elegibilidad de cobertura y mora coherente con pagos — contra PostgreSQL real y migrado.
 *
 * Brechas B06 (scheduleCoverage cubría cualquier cuota por su importe original) y B08 (el barrido
 * de mora trataba un aviso REPORTED como pago). Correr con:
 *   ERP_INTEGRATION_DATABASE_URL=postgres://usuario:clave@host:puerto/postgres \
 *     yarn test test/coverage-eligibility.integration.spec.ts
 */
import { ConflictException } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { addDays, businessDate } from '../src/common/time/business-date';
import { createMigratedDatabase, describeWithDatabase } from './support/coverage-integration-db';
import type { MigratedDatabase } from './support/coverage-integration-db';
import {
  addNotice,
  buildCoverageHarness,
  count,
  one,
  seedPurchase,
} from './support/coverage-fixtures';
import type { CoverageHarness, SeededPurchase } from './support/coverage-fixtures';

const REQUESTER = { userId: '11111111-1111-4111-8111-111111111111' };
const TODAY = businessDate();
const PAST = addDays(TODAY, -5);
const FUTURE = addDays(TODAY, 10);

describeWithDatabase('P-04 elegibilidad de cobertura (PostgreSQL real)', () => {
  let db: MigratedDatabase;
  let h: CoverageHarness;

  beforeAll(async () => {
    db = await createMigratedDatabase('cov_elig');
    h = await buildCoverageHarness(db.url);
  }, 120_000);

  afterAll(async () => {
    await h?.close();
    await db?.drop();
  });

  const schedule = (installmentId: string, now?: Date) =>
    h.coverage.scheduleCoverage(
      {
        installmentId,
        scheduledPaymentDate: TODAY,
        reason: 'CUSTOMER_INSTALLMENT_DEFAULT_COVERAGE',
      },
      REQUESTER,
      now,
    );

  async function snapshot(p: SeededPurchase, installmentId: string) {
    return {
      payables: await count(
        h.sequelize,
        'atlas_sales.merchant_payables WHERE installment_id = $1',
        [installmentId],
      ),
      reviews: await count(
        h.sequelize,
        'atlas_sales.coverage_review_items WHERE installment_id = $1',
        [installmentId],
      ),
      installment: await one<{ status: string }>(
        h.sequelize,
        'SELECT status FROM atlas_sales.bnpl_installments WHERE id = $1',
        [installmentId],
      ),
      purchase: p.purchaseId,
    };
  }

  async function expectRejectedWithoutMutation(
    p: SeededPurchase,
    installmentId: string,
    code: string,
    now?: Date,
  ) {
    const before = await snapshot(p, installmentId);
    const error = await schedule(installmentId, now).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ code });
    expect(await snapshot(p, installmentId)).toEqual(before);
  }

  it('rechaza cuota futura sin mutar nada', async () => {
    const p = await seedPurchase(h.sequelize, {
      installments: [{ dueDate: FUTURE, amount: '300.00' }],
    });
    await expectRejectedWithoutMutation(p, p.installments[0]!.id, 'NOT_DUE');
  });

  it('cubre la cuota vencida sin pago por su importe completo', async () => {
    const p = await seedPurchase(h.sequelize, {
      installments: [{ dueDate: PAST, amount: '300.00' }],
    });
    const result = await schedule(p.installments[0]!.id);

    expect(result).toMatchObject({
      outcome: 'SCHEDULED',
      amount: '300.00',
      currency: 'BOB',
      status: 'SCHEDULED',
      accountId: p.merchantAccountId,
    });
    const cuota = await one<{ status: string }>(
      h.sequelize,
      'SELECT status FROM atlas_sales.bnpl_installments WHERE id = $1',
      [p.installments[0]!.id],
    );
    expect(cuota.status).toBe('OVERDUE');
  });

  it('cubre la cuota parcialmente pagada sólo por el saldo', async () => {
    const p = await seedPurchase(h.sequelize, {
      installments: [{ dueDate: PAST, amount: '300.00' }],
    });
    await addNotice(h.sequelize, p, p.installments[0]!.id, {
      status: 'CONFIRMED',
      amount: '100.10',
    });

    const result = await schedule(p.installments[0]!.id);

    expect(result).toMatchObject({ outcome: 'SCHEDULED', amount: '199.90' });
    expect(result.eligibilityEvidence).toMatchObject({
      installmentAmount: '300.00',
      confirmedPaidAmount: '100.10',
      eligibleAmount: '199.90',
    });
  });

  it('manda a revisión la cobertura de una cuota con aviso de pago pendiente', async () => {
    const p = await seedPurchase(h.sequelize, {
      installments: [{ dueDate: PAST, amount: '300.00' }],
    });
    const installmentId = p.installments[0]!.id;
    const noticeId = await addNotice(h.sequelize, p, installmentId, {
      status: 'REPORTED',
      amount: '300.00',
    });

    const result = await schedule(installmentId);
    const again = await schedule(installmentId);

    expect(result).toMatchObject({
      outcome: 'REVIEW_REQUIRED',
      reason: 'COVERAGE_WITH_PENDING_NOTICE',
    });
    expect(
      (result.reviewItem as { details: { pendingNoticeIds: string[] } }).details,
    ).toMatchObject({ pendingNoticeIds: [noticeId] });
    expect(again).toMatchObject({ outcome: 'REVIEW_REQUIRED' });
    // Ni CxP (no hay aprobación implícita) ni cuota «pagada»; una sola revisión abierta.
    const after = await snapshot(p, installmentId);
    expect(after).toMatchObject({ payables: 0, reviews: 1, installment: { status: 'SCHEDULED' } });
    const queue = await h.coverage.listReviewQueue();
    expect(queue.some((item) => item.installmentId === installmentId)).toBe(true);
  });

  it('ignora un aviso rechazado: la cuota vencida es elegible por el total', async () => {
    const p = await seedPurchase(h.sequelize, {
      installments: [{ dueDate: PAST, amount: '300.00' }],
    });
    await addNotice(h.sequelize, p, p.installments[0]!.id, {
      status: 'REJECTED',
      amount: '300.00',
    });

    const result = await schedule(p.installments[0]!.id);

    expect(result).toMatchObject({ outcome: 'SCHEDULED', amount: '300.00' });
  });

  it('rechaza la cuota con pago confirmado sin mutar nada', async () => {
    const p = await seedPurchase(h.sequelize, {
      installments: [{ dueDate: PAST, amount: '300.00' }],
    });
    await addNotice(h.sequelize, p, p.installments[0]!.id, {
      status: 'CONFIRMED',
      amount: '300.00',
    });
    await expectRejectedWithoutMutation(p, p.installments[0]!.id, 'ALREADY_PAID');
  });

  it('rechaza una cuota ya pagada al comercio sin mutar nada', async () => {
    const p = await seedPurchase(h.sequelize, {
      installments: [{ dueDate: PAST, amount: '300.00', status: 'PAID_TO_MERCHANT' }],
    });
    await expectRejectedWithoutMutation(p, p.installments[0]!.id, 'ALREADY_PAID');
  });

  it('rechaza una cuota cancelada sin mutar nada', async () => {
    const p = await seedPurchase(h.sequelize, {
      installments: [{ dueDate: PAST, amount: '300.00', status: 'CANCELLED' }],
    });
    await expectRejectedWithoutMutation(p, p.installments[0]!.id, 'CANCELLED');
    const q = await seedPurchase(h.sequelize, {
      installments: [{ dueDate: PAST, amount: '300.00' }],
      purchaseStatus: 'CANCELLED',
    });
    await expectRejectedWithoutMutation(q, q.installments[0]!.id, 'CANCELLED');
  });

  it('rechaza una cuota ya cubierta sin mutar nada', async () => {
    const p = await seedPurchase(h.sequelize, {
      installments: [{ dueDate: PAST, amount: '300.00' }],
    });
    await schedule(p.installments[0]!.id);
    await expectRejectedWithoutMutation(p, p.installments[0]!.id, 'ALREADY_COVERED');
  });

  it('dos solicitudes concurrentes producen una sola CxP por el saldo', async () => {
    const p = await seedPurchase(h.sequelize, {
      installments: [{ dueDate: PAST, amount: '300.00' }],
    });
    await addNotice(h.sequelize, p, p.installments[0]!.id, {
      status: 'CONFIRMED',
      amount: '50.00',
    });

    const results = await Promise.allSettled([
      schedule(p.installments[0]!.id),
      schedule(p.installments[0]!.id),
      schedule(p.installments[0]!.id),
    ]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const ko = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(ko).toHaveLength(2);
    for (const r of ko) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    }
    const rows = await h.sequelize.query<{ amount: string }>(
      'SELECT amount::text AS amount FROM atlas_sales.merchant_payables WHERE installment_id = $1',
      { bind: [p.installments[0]!.id], type: QueryTypes.SELECT },
    );
    expect(rows).toEqual([{ amount: '250.00' }]);
  });

  it('el índice único impide una segunda CxP viva aunque se salte el servicio', async () => {
    const p = await seedPurchase(h.sequelize, {
      installments: [{ dueDate: PAST, amount: '300.00' }],
    });
    await schedule(p.installments[0]!.id);
    await expect(
      h.sequelize.query(
        `INSERT INTO atlas_sales.merchant_payables (account_id, purchase_id, installment_id, amount, scheduled_payment_date)
         VALUES ($1, $2, $3, 300, CURRENT_DATE)`,
        { bind: [p.merchantAccountId, p.purchaseId, p.installments[0]!.id] },
      ),
    ).rejects.toThrow();
  });

  it('registra motivo, actor, versión contractual y evidencia de la elegibilidad', async () => {
    const p = await seedPurchase(h.sequelize, {
      installments: [{ dueDate: PAST, amount: '300.00' }],
    });
    await schedule(p.installments[0]!.id);

    const row = await one<{
      reason: string;
      requested_by_user_id: string;
      contract_version_id: string;
      business_date: string;
      eligibility_evidence: Record<string, unknown>;
    }>(
      h.sequelize,
      `SELECT reason, requested_by_user_id, contract_version_id, business_date::text AS business_date,
              eligibility_evidence
         FROM atlas_sales.merchant_payables WHERE installment_id = $1`,
      [p.installments[0]!.id],
    );
    expect(row).toMatchObject({
      reason: 'CUSTOMER_INSTALLMENT_DEFAULT_COVERAGE',
      requested_by_user_id: REQUESTER.userId,
      contract_version_id: p.contractVersionId,
      business_date: TODAY,
    });
    expect(row.eligibility_evidence).toMatchObject({
      policy: 'coverage-eligibility/v1',
      dueDate: PAST,
      businessDate: TODAY,
      contract: {
        id: p.contractId,
        status: 'ACTIVE',
        versionId: p.contractVersionId,
        versionNumber: 3,
      },
    });
  });

  it('contrato no activo va a revisión, no a aprobación', async () => {
    const p = await seedPurchase(h.sequelize, {
      installments: [{ dueDate: PAST, amount: '300.00' }],
      contractStatus: 'TERMINATED',
    });
    const result = await schedule(p.installments[0]!.id);

    expect(result).toMatchObject({ outcome: 'REVIEW_REQUIRED', reason: 'CONTRACT_NOT_ACTIVE' });
    expect((await snapshot(p, p.installments[0]!.id)).payables).toBe(0);
  });

  it('corta el día en America/La_Paz, no en UTC', async () => {
    // 02:00 UTC del 24 = 22:00 del 23 en La Paz: la cuota que vence el 23 todavía está en plazo.
    const instant = new Date('2026-09-24T02:00:00Z');
    expect(businessDate(instant)).toBe('2026-09-23');
    const p = await seedPurchase(h.sequelize, {
      installments: [{ dueDate: '2026-09-23', amount: '300.00' }],
    });
    await expectRejectedWithoutMutation(p, p.installments[0]!.id, 'NOT_DUE', instant);

    const sweep = await h.sweep.sweep(undefined, { now: instant, noticeReviewHours: 72 });
    expect(sweep.corte).toBe('2026-09-23');
    const cuota = await one<{ status: string }>(
      h.sequelize,
      'SELECT status FROM atlas_sales.bnpl_installments WHERE id = $1',
      [p.installments[0]!.id],
    );
    expect(cuota.status).toBe('SCHEDULED');

    // Una hora después de la medianoche de La Paz ya está vencida.
    const nextDay = new Date('2026-09-24T05:00:00Z');
    await expect(schedule(p.installments[0]!.id, nextDay)).resolves.toMatchObject({
      outcome: 'SCHEDULED',
    });
  });

  it('cancelar una CxP no liquidada conserva la fila y permite reabrir la cobertura', async () => {
    const p = await seedPurchase(h.sequelize, {
      installments: [{ dueDate: PAST, amount: '300.00' }],
    });
    const first = await schedule(p.installments[0]!.id);
    const cancelled = await h.coverage.cancelPayable(
      first.id as string,
      { reason: 'Cobertura cargada por error de fecha' },
      REQUESTER,
    );
    expect(cancelled).toMatchObject({ outcome: 'CANCELLED', status: 'CANCELLED' });

    const second = await schedule(p.installments[0]!.id);
    expect(second.id).not.toBe(first.id);
    const rows = await h.sequelize.query<{ status: string; cancellation_reason: string | null }>(
      `SELECT status::text AS status, cancellation_reason FROM atlas_sales.merchant_payables
        WHERE installment_id = $1 ORDER BY created_at`,
      { bind: [p.installments[0]!.id], type: QueryTypes.SELECT },
    );
    expect(rows).toEqual([
      { status: 'CANCELLED', cancellation_reason: 'Cobertura cargada por error de fecha' },
      { status: 'SCHEDULED', cancellation_reason: null },
    ]);
  });

  describe('barrido de mora', () => {
    const NOW = new Date();
    const STALE = new Date(NOW.getTime() - 100 * 3_600_000);
    const RECENT = new Date(NOW.getTime() - 3_600_000);

    async function statusOf(id: string) {
      return (
        await one<{ status: string }>(
          h.sequelize,
          'SELECT status FROM atlas_sales.bnpl_installments WHERE id = $1',
          [id],
        )
      ).status;
    }

    it('el barrido no da por pagada una cuota con aviso REPORTED y la manda a revisión vencido el plazo', async () => {
      const p = await seedPurchase(h.sequelize, {
        installments: [
          { dueDate: PAST, amount: '300.00' },
          { dueDate: PAST, amount: '300.00' },
        ],
      });
      const fresh = p.installments[0]!;
      const stale = p.installments[1]!;
      await addNotice(h.sequelize, p, fresh.id, {
        status: 'REPORTED',
        amount: '300.00',
        createdAt: RECENT,
      });
      await addNotice(h.sequelize, p, stale.id, {
        status: 'REPORTED',
        amount: '300.00',
        createdAt: STALE,
      });

      await h.sweep.sweep(undefined, { now: NOW, noticeReviewHours: 72 });

      // Dentro del plazo: ni pagada ni en mora. Fuera del plazo: en mora y en la cola de revisión.
      expect(await statusOf(fresh.id)).toBe('SCHEDULED');
      expect(await statusOf(stale.id)).toBe('OVERDUE');
      expect(
        await count(
          h.sequelize,
          `atlas_sales.coverage_review_items WHERE installment_id = $1
             AND reason = 'PAYMENT_NOTICE_UNRESOLVED' AND status = 'OPEN'`,
          [stale.id],
        ),
      ).toBe(1);

      // Idempotente: otra pasada no duplica la revisión.
      await h.sweep.sweep(undefined, { now: NOW, noticeReviewHours: 72 });
      expect(
        await count(h.sequelize, 'atlas_sales.coverage_review_items WHERE installment_id = $1', [
          stale.id,
        ]),
      ).toBe(1);
    });

    it('el barrido ignora avisos rechazados y marca la cuota en mora', async () => {
      const p = await seedPurchase(h.sequelize, {
        installments: [{ dueDate: PAST, amount: '300.00' }],
      });
      await addNotice(h.sequelize, p, p.installments[0]!.id, {
        status: 'REJECTED',
        amount: '300.00',
      });

      await h.sweep.sweep(undefined, { now: NOW, noticeReviewHours: 72 });

      expect(await statusOf(p.installments[0]!.id)).toBe('OVERDUE');
    });

    it('el barrido respeta el pago confirmado y no toca la cuota futura', async () => {
      const p = await seedPurchase(h.sequelize, {
        installments: [
          { dueDate: PAST, amount: '300.00' },
          { dueDate: FUTURE, amount: '300.00' },
        ],
      });
      const paid = p.installments[0]!;
      const future = p.installments[1]!;
      await addNotice(h.sequelize, p, paid.id, { status: 'CONFIRMED', amount: '300.00' });

      await h.sweep.sweep(undefined, { now: NOW, noticeReviewHours: 72 });

      expect(await statusOf(paid.id)).toBe('SCHEDULED');
      expect(await statusOf(future.id)).toBe('SCHEDULED');
    });
  });
});
