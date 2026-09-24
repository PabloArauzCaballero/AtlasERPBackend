/**
 * P-05 · Pago de cobertura probado y recuperación sin duplicados — contra PostgreSQL real.
 *
 * Brecha B07: `markPayablePaid` aceptaba sólo `paidAt` (una fecha daba por pagado al comercio y
 * hacía nacer la CxC contra el consumidor) y `applyRecoveryPayment` sumaba un importe sin
 * identificador (repetir la llamada volvía a sumar). Incluye los pasos 7–9 de la jornada sintética
 * (§7 del plan): cobertura por BOB 300,00, liquidación verificada, recuperaciones de 100 + 200.
 */
import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { addDays, businessDate } from '../src/common/time/business-date';
import {
  applyRecoveryPaymentSchema,
  markPayablePaidSchema,
} from '../src/modules/b2b-sales-crm/b2b-sales-crm.schemas';
import type { MarkPayablePaidDto } from '../src/modules/b2b-sales-crm/b2b-sales-crm.dtos';
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

const REGISTRAR = { userId: '22222222-2222-4222-8222-222222222222' };
const APPROVER = { userId: '33333333-3333-4333-8333-333333333333' };
const COLLECTOR = { userId: '44444444-4444-4444-8444-444444444444' };
const TODAY = businessDate();
const PAST = addDays(TODAY, -5);
const FUTURE = addDays(TODAY, 20);

let referenceSeq = 0;
const ref = (prefix: string) => `${prefix}-${Date.now()}-${(referenceSeq += 1)}`;

describe('contrato HTTP de liquidación y recuperación (validación Zod)', () => {
  it('una fecha aislada no confirma el pago: el cuerpo con sólo paidAt se rechaza', () => {
    const result = markPayablePaidSchema.safeParse({ paidAt: '2026-09-20T12:00:00Z' });
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
    expect(paths).toEqual(
      expect.arrayContaining([
        'settlementReference',
        'amount',
        'currency',
        'beneficiaryAccountId',
        'evidenceFileId',
      ]),
    );
  });

  it('un cobro de recuperación sin referencia de pago se rechaza', () => {
    expect(applyRecoveryPaymentSchema.safeParse({ amount: 100 }).success).toBe(false);
  });

  it('rechaza importes con más de dos decimales o flotantes imprecisos en vez de redondear', () => {
    const base = { paymentReference: 'REC-1', currency: 'BOB' };
    expect(applyRecoveryPaymentSchema.safeParse({ ...base, amount: '100.005' }).success).toBe(
      false,
    );
    expect(applyRecoveryPaymentSchema.safeParse({ ...base, amount: 0.1 + 0.2 }).success).toBe(
      false,
    );
    expect(applyRecoveryPaymentSchema.safeParse({ ...base, amount: '-1.00' }).success).toBe(false);
    expect(applyRecoveryPaymentSchema.safeParse({ ...base, amount: '1e3' }).success).toBe(false);
    expect(applyRecoveryPaymentSchema.parse({ ...base, amount: '100.5' }).amount).toBe('100.50');
  });
});

describeWithDatabase('P-05 liquidación y recuperación (PostgreSQL real)', () => {
  let db: MigratedDatabase;
  let h: CoverageHarness;

  beforeAll(async () => {
    db = await createMigratedDatabase('cov_settle');
    h = await buildCoverageHarness(db.url);
  }, 120_000);

  afterAll(async () => {
    await h?.close();
    await db?.drop();
  });

  interface Scenario {
    purchase: SeededPurchase;
    installmentId: string;
    futureInstallmentId: string;
    payableId: string;
    evidenceFileId: string;
  }

  /** Paso 7 de la jornada: cuota de 300,00 vencida y cubierta; la tercera, futura, sin cobertura. */
  async function coveredInstallment(amount = '300.00'): Promise<Scenario> {
    const purchase = await seedPurchase(h.sequelize, {
      installments: [
        { dueDate: PAST, amount },
        { dueDate: FUTURE, amount: '300.00' },
      ],
    });
    const payable = await h.coverage.scheduleCoverage(
      {
        installmentId: purchase.installments[0]!.id,
        scheduledPaymentDate: TODAY,
        reason: 'CUSTOMER_INSTALLMENT_DEFAULT_COVERAGE',
      },
      REGISTRAR,
    );
    const evidenceFileId = await addEvidenceFile(h.sequelize, payable.id as string);
    return {
      purchase,
      installmentId: purchase.installments[0]!.id,
      futureInstallmentId: purchase.installments[1]!.id,
      payableId: payable.id as string,
      evidenceFileId,
    };
  }

  function settlementFor(
    s: Scenario,
    overrides: Partial<MarkPayablePaidDto> = {},
  ): MarkPayablePaidDto {
    return {
      settlementReference: ref('LIQ'),
      amount: '300.00',
      currency: 'BOB',
      beneficiaryAccountId: s.purchase.merchantAccountId,
      paidAt: new Date(Date.now() - 60_000),
      evidenceFileId: s.evidenceFileId,
      ...overrides,
    };
  }

  const recoveriesOf = (s: Scenario) =>
    count(h.sequelize, 'atlas_sales.consumer_recovery_receivables WHERE merchant_payable_id = $1', [
      s.payableId,
    ]);
  const outboxOf = (aggregateId: string) =>
    count(h.sequelize, 'atlas_accounting.event_outbox WHERE aggregate_id = $1', [aggregateId]);
  const payableStatus = async (s: Scenario) =>
    (
      await one<{ status: string }>(
        h.sequelize,
        'SELECT status::text AS status FROM atlas_sales.merchant_payables WHERE id = $1',
        [s.payableId],
      )
    ).status;

  it('un comprobante registrado no confirma el pago hasta la segunda firma', async () => {
    const s = await coveredInstallment();
    const result = await h.coverage.markPayablePaid(s.payableId, settlementFor(s), REGISTRAR);

    expect(result).toMatchObject({ outcome: 'PENDING_APPROVAL', recovery: null });
    expect(await payableStatus(s)).toBe('SCHEDULED');
    expect(await recoveriesOf(s)).toBe(0);
    expect(await outboxOf(s.payableId)).toBe(0);
  });

  it('quien registra la liquidación no puede aprobarla', async () => {
    const s = await coveredInstallment();
    await h.coverage.markPayablePaid(s.payableId, settlementFor(s), REGISTRAR);

    await expect(
      h.coverage.approvePayableSettlement(s.payableId, {}, REGISTRAR),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(await recoveriesOf(s)).toBe(0);
  });

  it('rechaza la liquidación con importe, moneda, beneficiario o evidencia que no corresponden', async () => {
    const s = await coveredInstallment();
    const inactive = await addEvidenceFile(h.sequelize, s.payableId, 'DELETED');
    const cases: Array<Partial<MarkPayablePaidDto>> = [
      { amount: '299.99' },
      { amount: '300.01' },
      { currency: 'USD' },
      { beneficiaryAccountId: s.purchase.otherAccountId },
      { evidenceFileId: '55555555-5555-4555-8555-555555555555' },
      { evidenceFileId: inactive },
      { paidAt: new Date(Date.now() + 86_400_000) },
    ];
    for (const overrides of cases) {
      await expect(
        h.coverage.markPayablePaid(s.payableId, settlementFor(s, overrides), REGISTRAR),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    }
    expect(
      await count(
        h.sequelize,
        'atlas_sales.merchant_payable_settlements WHERE merchant_payable_id = $1',
        [s.payableId],
      ),
    ).toBe(0);
  });

  it('la CxC de recuperación es 0 antes de liquidar y nace por el importe cubierto después', async () => {
    const s = await coveredInstallment();
    expect(await recoveriesOf(s)).toBe(0);

    await h.coverage.markPayablePaid(s.payableId, settlementFor(s), REGISTRAR);
    expect(await recoveriesOf(s)).toBe(0);

    const approved = await h.coverage.approvePayableSettlement(
      s.payableId,
      { note: 'Conciliado contra extracto sintético' },
      APPROVER,
    );

    expect(approved).toMatchObject({
      outcome: 'CONFIRMED',
      payable: { status: 'PAID' },
      recovery: { amountCoveredByAtlas: '300.00', amountRecovered: '0.00', recoveryStatus: 'OPEN' },
    });
    const recovery = await one<{ amount: string; consumer_id: string }>(
      h.sequelize,
      `SELECT amount_covered_by_atlas::text AS amount, consumer_id
         FROM atlas_sales.consumer_recovery_receivables WHERE merchant_payable_id = $1`,
      [s.payableId],
    );
    expect(recovery).toEqual({ amount: '300.00', consumer_id: s.purchase.consumerId });
    const cuotas = await h.sequelize.query<{ id: string; status: string }>(
      'SELECT id, status FROM atlas_sales.bnpl_installments WHERE purchase_id = $1 ORDER BY installment_number',
      { bind: [s.purchase.purchaseId], type: QueryTypes.SELECT },
    );
    expect(cuotas.map((c) => c.status)).toEqual(['COVERED_BY_ATLAS', 'SCHEDULED']);
    // El evento del outbox nació en la misma transacción.
    const event = await one<{ topic: string; payload: Record<string, unknown> }>(
      h.sequelize,
      'SELECT topic, payload FROM atlas_accounting.event_outbox WHERE aggregate_id = $1',
      [s.payableId],
    );
    expect(event).toMatchObject({
      topic: 'b2b.coverage.settled',
      payload: { amount: '300.00', currency: 'BOB', payableId: s.payableId },
    });
  });

  it('repetir el registro o la aprobación devuelve lo mismo sin duplicar', async () => {
    const s = await coveredInstallment();
    const body = settlementFor(s);
    await h.coverage.markPayablePaid(s.payableId, body, REGISTRAR);
    const replayRegister = await h.coverage.markPayablePaid(s.payableId, body, REGISTRAR);
    const first = await h.coverage.approvePayableSettlement(s.payableId, {}, APPROVER);
    const second = await h.coverage.approvePayableSettlement(s.payableId, {}, APPROVER);
    const afterPaid = await h.coverage.markPayablePaid(s.payableId, body, REGISTRAR);

    expect(replayRegister).toMatchObject({ outcome: 'PENDING_APPROVAL', replayed: true });
    expect(second).toMatchObject({ outcome: 'CONFIRMED', replayed: true });
    expect(afterPaid).toMatchObject({ outcome: 'CONFIRMED', replayed: true });
    expect((second.recovery as { id: string }).id).toBe((first.recovery as { id: string }).id);
    expect(await recoveriesOf(s)).toBe(1);
    expect(await outboxOf(s.payableId)).toBe(1);
  });

  it('la referencia de liquidación repetida en otra CxP se rechaza', async () => {
    const a = await coveredInstallment();
    const b = await coveredInstallment();
    const body = settlementFor(a);
    await h.coverage.markPayablePaid(a.payableId, body, REGISTRAR);

    await expect(
      h.coverage.markPayablePaid(
        b.payableId,
        settlementFor(b, { settlementReference: body.settlementReference }),
        REGISTRAR,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('si falla la escritura del evento nada se confirma y el reintento funciona', async () => {
    const s = await coveredInstallment();
    await h.coverage.markPayablePaid(s.payableId, settlementFor(s), REGISTRAR);
    h.messaging.withCarrier.mockImplementationOnce(() => {
      throw new Error('fallo simulado al escribir el outbox');
    });

    await expect(h.coverage.approvePayableSettlement(s.payableId, {}, APPROVER)).rejects.toThrow(
      'fallo simulado',
    );
    expect(await payableStatus(s)).toBe('SCHEDULED');
    expect(await recoveriesOf(s)).toBe(0);

    await expect(
      h.coverage.approvePayableSettlement(s.payableId, {}, APPROVER),
    ).resolves.toMatchObject({
      outcome: 'CONFIRMED',
    });
    expect(await recoveriesOf(s)).toBe(1);
    expect(await outboxOf(s.payableId)).toBe(1);
  });

  async function settledRecovery(amount = '300.00'): Promise<{ s: Scenario; recoveryId: string }> {
    const s = await coveredInstallment(amount);
    await h.coverage.markPayablePaid(s.payableId, settlementFor(s, { amount }), REGISTRAR);
    const approved = await h.coverage.approvePayableSettlement(s.payableId, {}, APPROVER);
    return { s, recoveryId: (approved.recovery as { id: string }).id };
  }

  const recoveryState = (recoveryId: string) =>
    one<{ recovered: string; status: string }>(
      h.sequelize,
      `SELECT amount_recovered::text AS recovered, recovery_status::text AS status
         FROM atlas_sales.consumer_recovery_receivables WHERE id = $1`,
      [recoveryId],
    );

  it('100 + 200 con referencias únicas dejan saldo 0 y repetir el primero no cambia nada', async () => {
    const { recoveryId } = await settledRecovery();
    const r100 = ref('REC');
    const first = await h.coverage.applyRecoveryPayment(
      recoveryId,
      { amount: '100.00', paymentReference: r100, currency: 'BOB' },
      COLLECTOR,
    );
    expect(first).toMatchObject({
      amountRecovered: '100.00',
      recoveryStatus: 'PARTIALLY_RECOVERED',
    });

    const second = await h.coverage.applyRecoveryPayment(
      recoveryId,
      { amount: '200.00', paymentReference: ref('REC'), currency: 'BOB' },
      COLLECTOR,
    );
    expect(second).toMatchObject({ amountRecovered: '300.00', recoveryStatus: 'RECOVERED' });

    const replay = await h.coverage.applyRecoveryPayment(
      recoveryId,
      { amount: '100.00', paymentReference: r100, currency: 'BOB' },
      COLLECTOR,
    );
    expect(replay).toMatchObject({
      replayed: true,
      amountRecovered: '300.00',
      recoveryStatus: 'RECOVERED',
    });
    expect(await recoveryState(recoveryId)).toEqual({ recovered: '300.00', status: 'RECOVERED' });
    expect(
      await count(h.sequelize, 'atlas_sales.consumer_recovery_movements WHERE recovery_id = $1', [
        recoveryId,
      ]),
    ).toBe(2);
    // Saldo = cubierto − recuperado = 0, y coincide con la suma de movimientos.
    const saldo = await one<{ saldo: string; movimientos: string }>(
      h.sequelize,
      `SELECT (r.amount_covered_by_atlas - r.amount_recovered)::text AS saldo,
              (SELECT sum(CASE m.movement_type WHEN 'PAYMENT' THEN m.amount ELSE -m.amount END)
                 FROM atlas_sales.consumer_recovery_movements m WHERE m.recovery_id = r.id)::text AS movimientos
         FROM atlas_sales.consumer_recovery_receivables r WHERE r.id = $1`,
      [recoveryId],
    );
    expect(saldo).toEqual({ saldo: '0.00', movimientos: '300.00' });
  });

  it('importe de recuperación excesivo se rechaza sin mutar', async () => {
    const { recoveryId } = await settledRecovery();
    await h.coverage.applyRecoveryPayment(
      recoveryId,
      { amount: '250.00', paymentReference: ref('REC'), currency: 'BOB' },
      COLLECTOR,
    );
    await expect(
      h.coverage.applyRecoveryPayment(
        recoveryId,
        { amount: '50.01', paymentReference: ref('REC'), currency: 'BOB' },
        COLLECTOR,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await recoveryState(recoveryId)).toEqual({
      recovered: '250.00',
      status: 'PARTIALLY_RECOVERED',
    });
  });

  it('una referencia de recuperación reutilizada con otro importe se rechaza', async () => {
    const { recoveryId } = await settledRecovery();
    const r = ref('REC');
    await h.coverage.applyRecoveryPayment(
      recoveryId,
      { amount: '100.00', paymentReference: r, currency: 'BOB' },
      COLLECTOR,
    );
    await expect(
      h.coverage.applyRecoveryPayment(
        recoveryId,
        { amount: '150.00', paymentReference: r, currency: 'BOB' },
        COLLECTOR,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect((await recoveryState(recoveryId)).recovered).toBe('100.00');
  });

  it('dos cobros concurrentes con la misma referencia suman una sola vez', async () => {
    const { recoveryId } = await settledRecovery();
    const r = ref('REC');
    const results = await Promise.allSettled(
      [1, 2, 3].map(() =>
        h.coverage.applyRecoveryPayment(
          recoveryId,
          { amount: '100.00', paymentReference: r, currency: 'BOB' },
          COLLECTOR,
        ),
      ),
    );
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(await recoveryState(recoveryId)).toEqual({
      recovered: '100.00',
      status: 'PARTIALLY_RECOVERED',
    });
  });

  it('suma exacta en centavos: 0,10 + 0,20 recuperan exactamente 0,30', async () => {
    const { recoveryId } = await settledRecovery('0.30');
    await h.coverage.applyRecoveryPayment(
      recoveryId,
      { amount: '0.10', paymentReference: ref('REC'), currency: 'BOB' },
      COLLECTOR,
    );
    const last = await h.coverage.applyRecoveryPayment(
      recoveryId,
      { amount: '0.20', paymentReference: ref('REC'), currency: 'BOB' },
      COLLECTOR,
    );
    expect(last).toMatchObject({ amountRecovered: '0.30', recoveryStatus: 'RECOVERED' });
  });

  it('el reverso de un cobro es un movimiento compensatorio que conserva saldo e historia', async () => {
    const { recoveryId } = await settledRecovery();
    const paid = await h.coverage.applyRecoveryPayment(
      recoveryId,
      { amount: '100.00', paymentReference: ref('REC'), currency: 'BOB' },
      COLLECTOR,
    );
    await h.coverage.applyRecoveryPayment(
      recoveryId,
      { amount: '200.00', paymentReference: ref('REC'), currency: 'BOB' },
      COLLECTOR,
    );
    const movementId = (paid.movement as { id: string }).id;
    const reversalReference = ref('REV');

    const reversed = await h.coverage.reverseRecoveryMovement(
      recoveryId,
      movementId,
      { reversalReference, reason: 'Devolución sintética al consumidor' },
      APPROVER,
    );
    const replay = await h.coverage.reverseRecoveryMovement(
      recoveryId,
      movementId,
      { reversalReference, reason: 'Devolución sintética al consumidor' },
      APPROVER,
    );

    expect(reversed).toMatchObject({
      amountRecovered: '200.00',
      recoveryStatus: 'PARTIALLY_RECOVERED',
    });
    expect(replay).toMatchObject({ replayed: true, amountRecovered: '200.00' });
    const movements = await h.coverage.listRecoveryMovements(recoveryId);
    expect(movements.map((m) => [m.movementType, m.amount])).toEqual([
      ['PAYMENT', '100.00'],
      ['PAYMENT', '200.00'],
      ['REVERSAL', '100.00'],
    ]);
    // La historia es de sólo inserción: ni editar ni borrar un movimiento.
    await expect(
      h.sequelize.query(
        'UPDATE atlas_sales.consumer_recovery_movements SET amount = 1 WHERE id = $1',
        {
          bind: [movementId],
        },
      ),
    ).rejects.toThrow(/sólo inserción/);
    await expect(
      h.sequelize.query('DELETE FROM atlas_sales.consumer_recovery_movements WHERE id = $1', {
        bind: [movementId],
      }),
    ).rejects.toThrow(/sólo inserción/);
  });

  it('una CxP liquidada no se cancela', async () => {
    const { s } = await settledRecovery();
    await expect(
      h.coverage.cancelPayable(s.payableId, { reason: 'Intento de cancelar tras pagar' }, APPROVER),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
