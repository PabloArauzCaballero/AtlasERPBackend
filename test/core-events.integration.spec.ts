/**
 * P-14 · P-08 · B20 — `payment.*` de Core en el ERP, contra PostgreSQL real y migrado.
 *
 * Lo que se mide: diez reenvíos de `payment.confirmed` confirman el aviso UNA vez; el desorden y los
 * duplicados no revierten una decisión; un pago confirmado sobre una cuota con cobertura viva NO se
 * confirma (sin doble beneficio) y va a la cola; una cuota sin mapeo o una decisión contradictoria
 * quedan como excepción visible; y lo que el ERP produce (`b2b.coverage.settled`, `b2b.recovery.*`)
 * cumple el contrato con `coreRef`.
 *
 *   ERP_INTEGRATION_DATABASE_URL=postgres://usuario:clave@host:puerto/postgres \
 *     yarn test:integration test/core-events.integration.spec.ts
 */
import { UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { addDays, businessDate } from '../src/common/time/business-date';
import type { PinoLoggerService } from '../src/common/logging/pino-logger.service';
import type { CoreEnvelope } from '../src/modules/b2b-sales-crm/integration/core-events.schemas';
import { CorePaymentEventsService } from '../src/modules/b2b-sales-crm/integration/core-payment-events.service';
import { B2BSalesCrmRepository } from '../src/modules/b2b-sales-crm/repositories/b2b-sales-crm.repository';
import { linkCoreInstallment } from '../src/modules/b2b-sales-crm/services/core-installment-link.support';
import { toEnvelope, type ClaimedEvent } from '../src/workers/outbox/outbox-relay';
import {
  loadSchemaRegistry,
  validateEnvelope,
  type TopicEntry,
} from './contracts/atlas-integration/json-schema-subset';
import { createMigratedDatabase, describeWithDatabase } from './support/coverage-integration-db';
import type { MigratedDatabase } from './support/coverage-integration-db';
import {
  addEvidenceFile,
  buildCoverageHarness,
  count,
  one,
  seedPurchase,
} from './support/coverage-fixtures';
import type { CoverageHarness, SeededPurchase } from './support/coverage-fixtures';

const CONTRACT = resolve(__dirname, '../contracts/atlas-integration-v1');
const registry = loadSchemaRegistry(CONTRACT);
const topics = (
  JSON.parse(readFileSync(join(CONTRACT, 'topics.json'), 'utf8')) as { topics: TopicEntry[] }
).topics;

const REQUESTER = { userId: '11111111-1111-4111-8111-111111111111' };
const APPROVER = { userId: '22222222-2222-4222-8222-222222222222' };
const REVIEWER = { userId: '55555555-5555-4555-8555-555555555555' };
const TODAY = businessDate();
const PAST = addDays(TODAY, -5);
const TENANT = '900001';

const silentLogger = {
  infoContext: () => undefined,
  debugContext: () => undefined,
  warnContext: () => undefined,
  errorContext: () => undefined,
} as unknown as PinoLoggerService;

let sequence = 1000;
const nextId = () => String((sequence += 1));

describeWithDatabase('P-14 consumidor de payment.* de Core (PostgreSQL real)', () => {
  let db: MigratedDatabase;
  let h: CoverageHarness;
  let consumer: CorePaymentEventsService;

  beforeAll(async () => {
    db = await createMigratedDatabase('core_events');
    h = await buildCoverageHarness(db.url);
    consumer = new CorePaymentEventsService(h.moduleRef.get(B2BSalesCrmRepository), silentLogger);
  }, 120_000);

  afterAll(async () => {
    await h?.close();
    await db?.drop();
  });

  interface Linked {
    purchase: SeededPurchase;
    installmentId: string;
    coreLoanId: string;
    coreInstallmentId: string;
  }

  /** Compra del ERP con su primera cuota ligada a una cuota de Core. */
  async function linkedInstallment(amount = '300.00', dueDate = PAST): Promise<Linked> {
    const purchase = await seedPurchase(h.sequelize, { installments: [{ dueDate, amount }] });
    const coreLoanId = nextId();
    const coreInstallmentId = nextId();
    await h.sequelize.transaction((transaction) =>
      linkCoreInstallment(
        h.sequelize,
        {
          erpPurchaseId: purchase.purchaseId,
          erpInstallmentId: purchase.installments[0]!.id,
          coreTenantId: TENANT,
          coreLoanId,
          coreInstallmentId,
          corePartnerProfileId: '930001',
        },
        transaction,
      ),
    );
    return { purchase, installmentId: purchase.installments[0]!.id, coreLoanId, coreInstallmentId };
  }

  function coreEvent(
    topic: 'payment.reported' | 'payment.confirmed' | 'payment.rejected',
    linked: Pick<Linked, 'coreLoanId' | 'coreInstallmentId'>,
    claimId: string,
    version: number,
    overrides: Record<string, unknown> = {},
  ): CoreEnvelope {
    const payload: Record<string, unknown> = {
      claimId,
      claimCode: `PAY-${claimId}`,
      loanId: linked.coreLoanId,
      installmentId: linked.coreInstallmentId,
      customerId: '950001',
      partnerProfileId: '930001',
      amount: '300.00',
      currencyCode: 'BOB',
      aggregateVersion: version,
      ...(topic === 'payment.confirmed'
        ? { decidedAt: new Date().toISOString(), loanPaymentId: nextId() }
        : {}),
      ...(topic === 'payment.rejected'
        ? { decidedAt: new Date().toISOString(), reason: 'No veo la transferencia' }
        : {}),
      ...overrides,
    };
    return {
      spec: 'atlas.core.outbox/1',
      eventKey: randomUUID(),
      topic,
      schemaVersion: 1,
      aggregate: { type: 'installment', id: linked.coreInstallmentId, version },
      occurredAt: new Date().toISOString(),
      producer: 'atlas-core',
      tenantId: TENANT,
      payload,
    };
  }

  const noticesOf = (installmentId: string) =>
    h.sequelize.query<{ status: string; core_claim_id: string; decided_by_user_id: string | null }>(
      `SELECT status, core_claim_id, decided_by_user_id FROM atlas_sales.consumer_payments_to_merchant
        WHERE installment_id = $1 ORDER BY created_at`,
      { bind: [installmentId], type: 'SELECT' as never },
    );
  const installmentStatus = async (id: string) =>
    (
      await one<{ status: string }>(
        h.sequelize,
        'SELECT status FROM atlas_sales.bnpl_installments WHERE id = $1',
        [id],
      )
    ).status;

  it('diez reenvíos de payment.confirmed confirman el aviso una sola vez y saldan la cuota', async () => {
    const linked = await linkedInstallment();
    const claimId = nextId();
    await consumer.receive(coreEvent('payment.reported', linked, claimId, 1));
    const confirmed = coreEvent('payment.confirmed', linked, claimId, 2);

    const outcomes = [];
    for (let i = 0; i < 5; i += 1) outcomes.push((await consumer.receive(confirmed)).outcome);
    outcomes.push(
      ...(await Promise.all(
        Array.from({ length: 5 }, () => consumer.receive(confirmed).then((r) => r.outcome)),
      )),
    );

    expect(outcomes.filter((o) => o === 'NOTICE_CONFIRMED')).toHaveLength(1);
    expect(outcomes.filter((o) => o === 'DUPLICATE')).toHaveLength(9);
    expect(await noticesOf(linked.installmentId)).toEqual([
      { status: 'CONFIRMED', core_claim_id: claimId, decided_by_user_id: null },
    ]);
    expect(await installmentStatus(linked.installmentId)).toBe('PAID_TO_MERCHANT');
    expect(
      await count(
        h.sequelize,
        'atlas_accounting.event_inbox WHERE consumer = $1 AND event_key = $2',
        ['core-payments', confirmed.eventKey],
      ),
    ).toBe(1);
  });

  it('desorden: la confirmación llega antes que el aviso; el aviso tardío no la revierte', async () => {
    const linked = await linkedInstallment();
    const claimId = nextId();
    expect(
      (await consumer.receive(coreEvent('payment.confirmed', linked, claimId, 2))).outcome,
    ).toBe('NOTICE_CONFIRMED');
    expect(
      (await consumer.receive(coreEvent('payment.reported', linked, claimId, 1))).outcome,
    ).toBe('NO_CHANGE');
    expect((await noticesOf(linked.installmentId)).map((n) => n.status)).toEqual(['CONFIRMED']);
    expect(await installmentStatus(linked.installmentId)).toBe('PAID_TO_MERCHANT');
  });

  it('payment.rejected deja el aviso REJECTED y la cuota vencida vuelve a estar en mora', async () => {
    const linked = await linkedInstallment();
    const claimId = nextId();
    await consumer.receive(coreEvent('payment.reported', linked, claimId, 1));
    expect(
      (await consumer.receive(coreEvent('payment.rejected', linked, claimId, 2))).outcome,
    ).toBe('NOTICE_REJECTED');
    expect((await noticesOf(linked.installmentId)).map((n) => n.status)).toEqual(['REJECTED']);
    expect(await installmentStatus(linked.installmentId)).toBe('OVERDUE');
  });

  it('una decisión contraria a la ya aplicada no se aplica: queda como excepción y se acusa', async () => {
    const linked = await linkedInstallment();
    const claimId = nextId();
    await consumer.receive(coreEvent('payment.rejected', linked, claimId, 2));
    const contrary = coreEvent('payment.confirmed', linked, claimId, 3);
    expect((await consumer.receive(contrary)).outcome).toBe('EXCEPTION');
    expect((await noticesOf(linked.installmentId)).map((n) => n.status)).toEqual(['REJECTED']);
    expect(
      await one<{ reason: string }>(
        h.sequelize,
        'SELECT reason FROM atlas_sales.core_event_exceptions WHERE event_key = $1',
        [contrary.eventKey],
      ),
    ).toEqual({ reason: 'CONFLICTING_DECISION' });
    expect(
      await one<{ outcome: string }>(
        h.sequelize,
        'SELECT outcome FROM atlas_accounting.event_inbox WHERE event_key = $1',
        [contrary.eventKey],
      ),
    ).toEqual({ outcome: 'EXCEPTION' });
  });

  it('pago tardío con cobertura viva: NO confirma (sin doble beneficio) y abre LATE_PAYMENT_WITH_COVERAGE', async () => {
    const linked = await linkedInstallment();
    await h.coverage.scheduleCoverage(
      {
        installmentId: linked.installmentId,
        scheduledPaymentDate: TODAY,
        reason: 'CUSTOMER_INSTALLMENT_DEFAULT_COVERAGE',
      },
      REQUESTER,
    );
    const claimId = nextId();
    const confirmed = coreEvent('payment.confirmed', linked, claimId, 2);
    expect((await consumer.receive(confirmed)).outcome).toBe('LATE_PAYMENT_REVIEW');
    expect((await consumer.receive(confirmed)).outcome).toBe('DUPLICATE');

    expect((await noticesOf(linked.installmentId)).map((n) => n.status)).toEqual(['REPORTED']);
    expect(await installmentStatus(linked.installmentId)).toBe('OVERDUE');
    const item = await one<{ id: string; details: Record<string, unknown> }>(
      h.sequelize,
      `SELECT id, details FROM atlas_sales.coverage_review_items
        WHERE installment_id = $1 AND reason = 'LATE_PAYMENT_WITH_COVERAGE' AND status = 'OPEN'`,
      [linked.installmentId],
    );
    expect(item.details).toMatchObject({ source: 'CORE', coreClaimId: claimId, amount: '300.00' });

    // La cola lo resuelve con la misma regla: confirmar exige cancelar antes la cobertura.
    await expect(
      h.review.resolveReviewItem(
        item.id,
        { action: 'CONFIRM_NOTICE', note: 'pagó tarde' },
        REVIEWER,
      ),
    ).rejects.toMatchObject({ response: { code: 'COVERAGE_IN_PLACE' } });
    const rejected = await h.review.resolveReviewItem(
      item.id,
      { action: 'REJECT_NOTICE', note: 'el cobro se registra como recuperación' },
      REVIEWER,
    );
    expect(rejected).toMatchObject({ outcome: 'NOTICE_REJECTED' });
  });

  it('una cuota sin mapeo a Core se acusa como excepción UNLINKED_INSTALLMENT, sin tocar nada', async () => {
    const ghost = { coreLoanId: nextId(), coreInstallmentId: nextId() };
    const event = coreEvent('payment.confirmed', ghost, nextId(), 2);
    expect((await consumer.receive(event)).outcome).toBe('EXCEPTION');
    expect(
      await one<{ reason: string }>(
        h.sequelize,
        'SELECT reason FROM atlas_sales.core_event_exceptions WHERE event_key = $1',
        [event.eventKey],
      ),
    ).toEqual({ reason: 'UNLINKED_INSTALLMENT' });
  });

  it('un préstamo distinto del mapeado o una moneda distinta no se aplican', async () => {
    const linked = await linkedInstallment();
    const wrongLoan = coreEvent(
      'payment.reported',
      { ...linked, coreLoanId: nextId() },
      nextId(),
      1,
    );
    const wrongCurrency = coreEvent('payment.reported', linked, nextId(), 1, {
      currencyCode: 'USD',
    });
    expect((await consumer.receive(wrongLoan)).outcome).toBe('EXCEPTION');
    expect((await consumer.receive(wrongCurrency)).outcome).toBe('EXCEPTION');
    expect(await noticesOf(linked.installmentId)).toEqual([]);
  });

  it('un payload fuera de contrato es 422 y no deja recibo en la inbox', async () => {
    const linked = await linkedInstallment();
    const bad = coreEvent('payment.confirmed', linked, nextId(), 2, { amount: 300 });
    await expect(consumer.receive(bad)).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      consumer.receive({ ...bad, topic: 'loan.disbursed', payload: {} }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(
      await count(h.sequelize, 'atlas_accounting.event_inbox WHERE event_key = $1', [bad.eventKey]),
    ).toBe(0);
  });

  it('lo que el ERP produce al liquidar y recuperar cumple el contrato y lleva coreRef', async () => {
    const linked = await linkedInstallment();
    const payable = await h.coverage.scheduleCoverage(
      {
        installmentId: linked.installmentId,
        scheduledPaymentDate: TODAY,
        reason: 'CUSTOMER_INSTALLMENT_DEFAULT_COVERAGE',
      },
      REQUESTER,
    );
    const payableId = payable.id as string;
    const evidenceFileId = await addEvidenceFile(h.sequelize, payableId);
    await h.coverage.markPayablePaid(
      payableId,
      {
        settlementReference: `LIQ-${randomUUID().slice(0, 8)}`,
        amount: '300.00',
        currency: 'BOB',
        beneficiaryAccountId: linked.purchase.merchantAccountId,
        paidAt: new Date(Date.now() - 60_000),
        evidenceFileId,
      },
      REQUESTER,
    );
    await h.coverage.approvePayableSettlement(payableId, {}, APPROVER);
    const recovery = await one<{ id: string }>(
      h.sequelize,
      'SELECT id FROM atlas_sales.consumer_recovery_receivables WHERE merchant_payable_id = $1',
      [payableId],
    );
    await h.coverage.applyRecoveryPayment(
      recovery.id,
      { amount: '100.00', paymentReference: `REC-${randomUUID().slice(0, 8)}`, currency: 'BOB' },
      REQUESTER,
    );

    const rows = await h.sequelize.query<ClaimedEvent>(
      `SELECT id::text, topic, aggregate_type, aggregate_id, aggregate_version::text, schema_version,
              event_key, payload, trace_context, created_at, attempts
         FROM atlas_accounting.event_outbox
        WHERE topic IN ('b2b.coverage.settled', 'b2b.recovery.payment_applied')
          AND (aggregate_id = $1 OR aggregate_id = $2) ORDER BY id`,
      { bind: [payableId, recovery.id], type: 'SELECT' as never },
    );
    expect(rows.map((r) => r.topic)).toEqual([
      'b2b.coverage.settled',
      'b2b.recovery.payment_applied',
    ]);
    for (const row of rows) {
      // El MISMO sobre que el worker entrega (`toEnvelope` del relay), tal como viaja por la red.
      const envelope = JSON.parse(JSON.stringify(toEnvelope(row)));
      expect({ topic: row.topic, errores: validateEnvelope(registry, topics, envelope) }).toEqual({
        topic: row.topic,
        errores: [],
      });
      expect((row.payload as Record<string, unknown>).coreRef).toEqual({
        tenantId: TENANT,
        loanId: linked.coreLoanId,
        installmentId: linked.coreInstallmentId,
        partnerProfileId: '930001',
      });
    }
  });

  it('dos cuotas del ERP no pueden ligarse a la misma cuota de Core (409)', async () => {
    const linked = await linkedInstallment();
    const other = await seedPurchase(h.sequelize, {
      installments: [{ dueDate: PAST, amount: '10.00' }],
    });
    await expect(
      h.sequelize.transaction((transaction) =>
        linkCoreInstallment(
          h.sequelize,
          {
            erpPurchaseId: other.purchaseId,
            erpInstallmentId: other.installments[0]!.id,
            coreTenantId: TENANT,
            coreLoanId: linked.coreLoanId,
            coreInstallmentId: linked.coreInstallmentId,
            corePartnerProfileId: null,
          },
          transaction,
        ),
      ),
    ).rejects.toMatchObject({ response: { code: 'CORE_INSTALLMENT_ALREADY_LINKED' } });
  });
});
