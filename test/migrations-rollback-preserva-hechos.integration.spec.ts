/**
 * P-17 · Rollback de las migraciones del 2026-09-24 sin destruir hechos financieros.
 *
 * Contra PostgreSQL REAL y recién migrado, con un ciclo financiero hecho por los servicios de
 * verdad (cobertura → liquidación con doble control → recuperación 100 + 200) y eventos de outbox:
 *
 *  - la reversa de cobertura/liquidación se NIEGA mientras existan liquidaciones o cobros, y la
 *    negativa no toca nada (se ejecuta en una transacción, como `scripts/db/run-sql.ts`);
 *  - las reversas de P-07, P-06 y del outbox sólo retiran restricciones e índices: el contenido de
 *    cada tabla financiera queda idéntico byte a byte (md5 de todas sus filas);
 *  - volver a aplicar las migraciones de ida (corrección hacia adelante) restaura las restricciones
 *    sin tocar los datos.
 *
 * Sin `ERP_INTEGRATION_DATABASE_URL` la suite se SALTA y lo dice; con `ERP_INTEGRATION_REQUIRED=1`
 * es un fallo.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { addDays, businessDate } from '../src/common/time/business-date';
import { MIGRATION_SEARCH_PATH } from '../src/database/startup-migrations';
import { createMigratedDatabase, describeWithDatabase } from './support/coverage-integration-db';
import type { MigratedDatabase } from './support/coverage-integration-db';
import { addEvidenceFile, buildCoverageHarness, seedPurchase } from './support/coverage-fixtures';
import type { CoverageHarness } from './support/coverage-fixtures';

const MIGRATIONS = 'src/database/migrations';
const OUTBOX = `${MIGRATIONS}/20260924100000-outbox-entrega-real`;
const COVERAGE = `${MIGRATIONS}/20260924200000-cobertura-elegibilidad-liquidacion`;
const P06 = `${MIGRATIONS}/20260924300000-p06-origen-contable-unico`;
const P07 = `${MIGRATIONS}/20260924300100-p07-mdr-de-la-compra`;

/** Tablas cuyo contenido es un hecho financiero o su evidencia. */
const FACT_TABLES = [
  'atlas_sales.bnpl_purchases',
  'atlas_sales.bnpl_installments',
  'atlas_sales.merchant_payables',
  'atlas_sales.merchant_payable_settlements',
  'atlas_sales.consumer_recovery_receivables',
  'atlas_sales.consumer_recovery_movements',
  'atlas_accounting.erp_file',
  'atlas_accounting.event_outbox',
];

const REGISTRAR = { userId: '22222222-2222-4222-8222-222222222222' };
const APPROVER = { userId: '33333333-3333-4333-8333-333333333333' };
const COLLECTOR = { userId: '44444444-4444-4444-8444-444444444444' };

describeWithDatabase('P-17 rollback de migraciones sin destruir hechos (PostgreSQL real)', () => {
  let db: MigratedDatabase;
  let h: CoverageHarness;
  let client: Client;

  /** Igual que el ejecutor del despliegue: un archivo = una transacción con su search_path. */
  async function runFile(file: string): Promise<void> {
    const sql = readFileSync(resolve(file), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(`SET LOCAL search_path TO ${MIGRATION_SEARCH_PATH}`);
      await client.query(sql);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  async function fingerprint(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const table of FACT_TABLES) {
      const { rows } = await client.query<{ n: string; digest: string | null }>(
        `SELECT count(*)::text AS n, md5(string_agg(t::text, '|' ORDER BY t::text)) AS digest FROM ${table} t`,
      );
      result[table] = `${rows[0]!.n}:${rows[0]!.digest ?? '-'}`;
    }
    return result;
  }

  async function constraintExists(name: string): Promise<boolean> {
    const { rows } = await client.query('SELECT 1 FROM pg_constraint WHERE conname = $1', [name]);
    return rows.length > 0;
  }

  async function indexExists(name: string): Promise<boolean> {
    const { rows } = await client.query('SELECT 1 FROM pg_indexes WHERE indexname = $1', [name]);
    return rows.length > 0;
  }

  beforeAll(async () => {
    db = await createMigratedDatabase('rollback');
    h = await buildCoverageHarness(db.url);
    client = new Client({ connectionString: db.url });
    await client.connect();

    // Un ciclo completo por los servicios: CxP, liquidación confirmada por otra persona, CxC de
    // recuperación y dos cobros; eso deja además eventos en el outbox.
    const today = businessDate();
    const purchase = await seedPurchase(h.sequelize, {
      installments: [{ dueDate: addDays(today, -5), amount: '300.00' }],
    });
    const payable = await h.coverage.scheduleCoverage(
      {
        installmentId: purchase.installments[0]!.id,
        scheduledPaymentDate: today,
        reason: 'CUSTOMER_INSTALLMENT_DEFAULT_COVERAGE',
      },
      REGISTRAR,
    );
    const payableId = payable.id as string;
    const evidenceFileId = await addEvidenceFile(h.sequelize, payableId);
    await h.coverage.markPayablePaid(
      payableId,
      {
        settlementReference: `LIQ-ROLLBACK-${Date.now()}`,
        amount: '300.00',
        currency: 'BOB',
        beneficiaryAccountId: purchase.merchantAccountId,
        paidAt: new Date(Date.now() - 60_000),
        evidenceFileId,
      },
      REGISTRAR,
    );
    const approved = await h.coverage.approvePayableSettlement(payableId, {}, APPROVER);
    const recoveryId = (approved.recovery as { id: string }).id;
    for (const [amount, suffix] of [
      ['100.00', 'A'],
      ['200.00', 'B'],
    ] as const) {
      await h.coverage.applyRecoveryPayment(
        recoveryId,
        { amount, paymentReference: `REC-ROLLBACK-${Date.now()}-${suffix}`, currency: 'BOB' },
        COLLECTOR,
      );
    }
    // P-07: la instantánea de MDR con la que se cobró la compra, que la reversa debe conservar.
    await client.query(
      `UPDATE atlas_sales.bnpl_purchases
          SET mdr_rate_percent = 3.5, mdr_amount = 10.50, mdr_pricing_source = 'mdr_rules'
        WHERE id = $1`,
      [purchase.purchaseId],
    );
  }, 180_000);

  afterAll(async () => {
    await client?.end();
    await h?.close();
    await db?.drop();
  });

  it('el ciclo sintético dejó hechos en cada tabla que las reversas podrían tocar', async () => {
    const facts = await fingerprint();
    for (const table of [
      'atlas_sales.merchant_payable_settlements',
      'atlas_sales.consumer_recovery_movements',
      'atlas_accounting.event_outbox',
    ]) {
      expect(Number(facts[table]!.split(':')[0])).toBeGreaterThan(0);
    }
  });

  it('la reversa de cobertura/liquidación se niega con hechos registrados y no toca nada', async () => {
    const before = await fingerprint();
    await expect(runFile(`${COVERAGE}.down.sql`)).rejects.toThrow(/Reversa rechazada/);
    expect(await fingerprint()).toEqual(before);
    expect(await indexExists('uq_merchant_payable_live_per_installment')).toBe(true);
  });

  it('las reversas de P-07, P-06 y outbox sólo retiran restricciones: los hechos quedan idénticos', async () => {
    const before = await fingerprint();
    await runFile(`${P07}.down.sql`);
    await runFile(`${P06}.down.sql`);
    await runFile(`${OUTBOX}.down.sql`);

    expect(await fingerprint()).toEqual(before);
    expect(await constraintExists('ck_bnpl_purchases_mdr_snapshot')).toBe(false);
    expect(await indexExists('uq_accounting_document_merchant_invoice_origin')).toBe(false);
    expect(await constraintExists('chk_event_outbox_published_consistent')).toBe(false);
    const { rows } = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM atlas_sales.bnpl_purchases WHERE mdr_amount = 10.50`,
    );
    expect(rows[0]!.n).toBe('1');
  });

  it('corrección hacia adelante: reaplicar las migraciones de ida restaura los controles sin tocar datos', async () => {
    const before = await fingerprint();
    await runFile(`${OUTBOX}.sql`);
    await runFile(`${P06}.sql`);
    await runFile(`${P07}.sql`);

    expect(await fingerprint()).toEqual(before);
    expect(await constraintExists('ck_bnpl_purchases_mdr_snapshot')).toBe(true);
    expect(await indexExists('uq_accounting_document_merchant_invoice_origin')).toBe(true);
    expect(await constraintExists('chk_event_outbox_published_consistent')).toBe(true);
  });
});
