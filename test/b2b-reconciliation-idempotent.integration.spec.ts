/**
 * Conciliación de la cartera B2B contra PostgreSQL REAL (adenda 2026-09-29, 4e y 4f).
 *
 * - Cada corrida volvía a crear un ítem ABIERTO por cada inconsistencia ya abierta: tras diez
 *   corridas, diez copias del mismo pendiente. Ahora la clave natural (`itemType`, `sourceRef`)
 *   con un ítem abierto no se duplica, y la corrida lo cuenta en `alreadyOpenItemCount`.
 * - Los listados con tope de 200 cortan por un orden determinista y útil: las cuotas pendientes
 *   primero; coberturas y recuperaciones por fecha de alta, no por uuid.
 * Datos sintéticos, base propia migrada con las migraciones de arranque.
 */
import { addDays, businessDate } from '../src/common/time/business-date';
import { createMigratedDatabase, describeWithDatabase } from './support/coverage-integration-db';
import type { MigratedDatabase } from './support/coverage-integration-db';
import { buildCoverageHarness, count, seedPurchase } from './support/coverage-fixtures';
import type { CoverageHarness } from './support/coverage-fixtures';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const USER = { sub: USER_ID, role: 'ADMIN' } as never;
const TODAY = businessDate();

describeWithDatabase('Conciliación B2B idempotente y topes ordenados (PostgreSQL real)', () => {
  let db: MigratedDatabase;
  let h: CoverageHarness;

  beforeAll(async () => {
    db = await createMigratedDatabase('recon');
    h = await buildCoverageHarness(db.url);
    // `started_by_user_id` es FK a internal_users: la corrida la firma una persona que existe.
    await h.sequelize.query(
      `INSERT INTO atlas_sales.internal_users (id, full_name, email, role_code)
       VALUES ($1, 'Conciliadora sintética', 'conciliadora@atlas.test', 'ADMIN')`,
      { bind: [USER_ID] },
    );
  }, 120_000);

  afterAll(async () => {
    await h?.close();
    await db?.drop();
  });

  it('una segunda corrida no duplica los ítems abiertos; uno resuelto vuelve a detectarse', async () => {
    const purchase = await seedPurchase(h.sequelize, {
      installments: [{ dueDate: addDays(TODAY, -10), amount: '100.00', status: 'OVERDUE' }],
    });
    const period = { periodStart: addDays(TODAY, -30), periodEnd: addDays(TODAY, 1) };
    const openFor = (itemType: string, sourceRef: string) =>
      count(
        h.sequelize,
        `atlas_sales.reconciliation_items WHERE item_type = $1 AND source_ref = $2 AND status = 'OPEN'`,
        [itemType, sourceRef],
      );

    const first = (await h.reconciliation.runReconciliation(period, USER)) as {
      status: string;
      items: Array<{ itemType: string; sourceRef: string }>;
      alreadyOpenItemCount: number;
    };
    expect(first.items.map((i) => `${i.itemType}:${i.sourceRef}`).sort()).toEqual(
      [`CXP_MERCHANT:${purchase.installments[0]!.id}`, `MDR:${purchase.purchaseId}`].sort(),
    );
    expect(first.alreadyOpenItemCount).toBe(0);

    const second = (await h.reconciliation.runReconciliation(period, USER)) as typeof first;
    expect(second.items).toEqual([]);
    expect(second.alreadyOpenItemCount).toBe(2);
    expect(second.status).toBe('OPEN_ITEMS');
    expect(await openFor('MDR', purchase.purchaseId)).toBe(1);
    expect(await openFor('CXP_MERCHANT', purchase.installments[0]!.id)).toBe(1);

    await h.sequelize.query(
      `UPDATE atlas_sales.reconciliation_items SET status = 'RESOLVED', resolved_at = now()
        WHERE item_type = 'MDR' AND source_ref = $1`,
      { bind: [purchase.purchaseId] },
    );
    const third = (await h.reconciliation.runReconciliation(period, USER)) as typeof first;
    expect(third.items.map((i) => `${i.itemType}:${i.sourceRef}`)).toEqual([
      `MDR:${purchase.purchaseId}`,
    ]);
    expect(third.alreadyOpenItemCount).toBe(1);
  });

  it('las cuotas pendientes salen antes que las ya cerradas, aunque venzan después', async () => {
    const purchase = await seedPurchase(h.sequelize, {
      installments: [
        { dueDate: '2020-01-10', amount: '50.00', status: 'PAID_TO_MERCHANT' },
        { dueDate: '2099-01-10', amount: '50.00', status: 'SCHEDULED' },
      ],
    });
    const rows = (await h.reconciliation.listInstallments()) as Array<{
      id: string;
      status: string;
    }>;
    const ids = rows.map((r) => r.id);
    expect(ids.indexOf(purchase.installments[1]!.id)).toBeLessThan(
      ids.indexOf(purchase.installments[0]!.id),
    );
    const firstClosed = rows.findIndex((r) => !['OVERDUE', 'SCHEDULED'].includes(r.status));
    const lastPending = rows
      .map((r) => ['OVERDUE', 'SCHEDULED'].includes(r.status))
      .lastIndexOf(true);
    expect(firstClosed === -1 || lastPending < firstClosed).toBe(true);
  });

  it('coberturas y recuperaciones salen por fecha de alta descendente, no por uuid', async () => {
    const purchase = await seedPurchase(h.sequelize, {
      installments: [
        { dueDate: addDays(TODAY, -40), amount: '10.00', status: 'COVERED_BY_ATLAS' },
        { dueDate: addDays(TODAY, -20), amount: '10.00', status: 'COVERED_BY_ATLAS' },
      ],
    });
    // Ids fijados a propósito: el orden anterior (uuid DESC) pondría primero la MÁS VIEJA.
    const older = 'ffffffff-0000-4000-8000-000000000001';
    const newer = '00000000-0000-4000-8000-000000000001';
    const payable = (id: string, installmentId: string, createdAt: string) =>
      h.sequelize.query(
        `INSERT INTO atlas_sales.merchant_payables
           (id, account_id, purchase_id, installment_id, amount, scheduled_payment_date, status, created_at)
         VALUES ($1, $2, $3, $4, 10, $5, 'PAID', $6)`,
        {
          bind: [
            id,
            purchase.merchantAccountId,
            purchase.purchaseId,
            installmentId,
            TODAY,
            createdAt,
          ],
        },
      );
    await payable(older, purchase.installments[0]!.id, '2026-01-01T00:00:00Z');
    await payable(newer, purchase.installments[1]!.id, '2026-06-01T00:00:00Z');
    const recovery = (id: string, payableId: string, installmentId: string, createdAt: string) =>
      h.sequelize.query(
        `INSERT INTO atlas_sales.consumer_recovery_receivables
           (id, consumer_id, purchase_id, installment_id, merchant_payable_id, amount_covered_by_atlas,
            amount_recovered, recovery_status, days_past_due, created_at)
         VALUES ($1, $2, $3, $4, $5, 10, 0, 'OPEN', 5, $6)`,
        {
          bind: [id, purchase.consumerId, purchase.purchaseId, installmentId, payableId, createdAt],
        },
      );
    await recovery(older, older, purchase.installments[0]!.id, '2026-01-02T00:00:00Z');
    await recovery(newer, newer, purchase.installments[1]!.id, '2026-06-02T00:00:00Z');

    const payables = (await h.reconciliation.listPayables()) as Array<{ id: string }>;
    const payableIds = payables.map((p) => p.id);
    expect(payableIds.indexOf(newer)).toBeLessThan(payableIds.indexOf(older));

    const recoveries = (await h.reconciliation.listRecoveries()) as Array<{
      merchantPayableId: string;
    }>;
    const byPayable = recoveries.map((r) => r.merchantPayableId);
    expect(byPayable.indexOf(newer)).toBeLessThan(byPayable.indexOf(older));
  });
});
