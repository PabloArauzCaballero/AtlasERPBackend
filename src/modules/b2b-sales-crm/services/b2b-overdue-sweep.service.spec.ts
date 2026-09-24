import { B2BOverdueSweepService } from './b2b-overdue-sweep.service';

/**
 * La pasada de vencidas con el repositorio fingido: lo que importa es QUÉ cuotas cambian. La
 * versión con base real está en test/coverage-eligibility.integration.spec.ts.
 *
 * Hasta el 2026-09-24 un aviso REPORTED (el consumidor dice que pagó, nadie lo verificó) contaba
 * como pago y dejaba la cuota fuera de mora para siempre. Ahora sólo un pago CONFIRMED la saca; un
 * REPORTED da un plazo y, vencido, va a la cola de revisión.
 */
const NOW = new Date('2026-09-20T15:00:00Z');
const RECENT = new Date('2026-09-20T10:00:00Z');
const STALE = new Date('2026-09-10T10:00:00Z');

interface Notice {
  id: string;
  installmentId: string;
  status: 'REPORTED' | 'CONFIRMED';
  amount: string;
  createdAt: Date;
}

function build(cuotas: Array<{ id: string; amount?: string }>, avisos: Notice[]) {
  const installments = {
    findAll: jest
      .fn()
      .mockResolvedValue(
        cuotas.map((c) => ({ id: c.id, amount: c.amount ?? '100.00', status: 'SCHEDULED' })),
      ),
    update: jest.fn().mockResolvedValue([0]),
  };
  const consumerPaymentsToMerchant = { findAll: jest.fn().mockResolvedValue(avisos) };
  const reviewItems = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
  };
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const repository = {
    installments,
    consumerPaymentsToMerchant,
    transaction: jest.fn(async (callback: (t: unknown) => Promise<unknown>) =>
      callback(transaction),
    ),
  };
  const logger = { infoContext: jest.fn() };
  const service = new B2BOverdueSweepService(
    repository as never,
    logger as never,
    reviewItems as never,
  );
  return { service, installments, consumerPaymentsToMerchant, reviewItems };
}

function markedIds(update: jest.Mock): string[] {
  const [, options] = update.mock.calls[0] as [
    Record<string, unknown>,
    { where: { id: { [key: symbol]: string[] } } },
  ];
  return Object.getOwnPropertySymbols(options.where.id).flatMap((s) => options.where.id[s] ?? []);
}

describe('la pasada de cuotas BNPL vencidas', () => {
  it('marca OVERDUE las vencidas sin pago confirmado y respeta la que tiene pago CONFIRMED', async () => {
    const { service, installments } = build(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      [{ id: 'n1', installmentId: 'b', status: 'CONFIRMED', amount: '100.00', createdAt: STALE }],
    );
    const result = await service.sweep('2026-09-14', { now: NOW, noticeReviewHours: 72 });

    expect(result).toEqual({
      corte: '2026-09-14',
      revisadas: 3,
      marcadas: 2,
      conPago: 1,
      avisoPendiente: 0,
      enRevision: 0,
    });
    expect(markedIds(installments.update)).toEqual(['a', 'c']);
  });

  it('un aviso REPORTED dentro del plazo no es pago: la cuota queda pendiente, sin mora ni revisión', async () => {
    const { service, installments, reviewItems } = build(
      [{ id: 'a' }],
      [{ id: 'n1', installmentId: 'a', status: 'REPORTED', amount: '100.00', createdAt: RECENT }],
    );
    const result = await service.sweep('2026-09-14', { now: NOW, noticeReviewHours: 72 });

    expect(result).toMatchObject({ avisoPendiente: 1, marcadas: 0, conPago: 0, enRevision: 0 });
    expect(installments.update).not.toHaveBeenCalled();
    expect(reviewItems.create).not.toHaveBeenCalled();
  });

  it('un aviso REPORTED vencido el plazo va a revisión y la cuota pasa a mora', async () => {
    const { service, installments, reviewItems } = build(
      [{ id: 'a' }],
      [{ id: 'n1', installmentId: 'a', status: 'REPORTED', amount: '100.00', createdAt: STALE }],
    );
    const result = await service.sweep('2026-09-14', { now: NOW, noticeReviewHours: 72 });

    expect(result).toMatchObject({ enRevision: 1, marcadas: 1, conPago: 0 });
    expect(markedIds(installments.update)).toEqual(['a']);
    expect(reviewItems.create).toHaveBeenCalledWith(
      expect.objectContaining({ installmentId: 'a', reason: 'PAYMENT_NOTICE_UNRESOLVED' }),
      expect.anything(),
    );
  });

  it('un pago confirmado PARCIAL no saca la cuota de mora', async () => {
    const { service, installments } = build(
      [{ id: 'a', amount: '300.00' }],
      [{ id: 'n1', installmentId: 'a', status: 'CONFIRMED', amount: '100.00', createdAt: STALE }],
    );
    const result = await service.sweep('2026-09-14', { now: NOW, noticeReviewHours: 72 });

    expect(result).toMatchObject({ marcadas: 1, conPago: 0 });
    expect(markedIds(installments.update)).toEqual(['a']);
  });

  it('sin vencidas no escribe nada', async () => {
    const { service, installments, consumerPaymentsToMerchant } = build([], []);
    const result = await service.sweep('2026-09-14', { now: NOW, noticeReviewHours: 72 });

    expect(result.revisadas).toBe(0);
    expect(consumerPaymentsToMerchant.findAll).not.toHaveBeenCalled();
    expect(installments.update).not.toHaveBeenCalled();
  });
});
