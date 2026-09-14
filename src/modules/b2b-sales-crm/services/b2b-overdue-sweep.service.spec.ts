import { B2BOverdueSweepService } from './b2b-overdue-sweep.service';

/**
 * La pasada de vencidas con el repositorio fingido: lo que importa es QUÉ cuotas cambian.
 * La respuesta ingenua —marcar toda cuota con fecha pasada— pisaría las que el consumidor sí
 * pagó y el comercio reportó; por eso el caso central tiene una vencida con pago.
 */
function build(cuotas: string[], pagadas: string[]) {
  const installments = {
    findAll: jest.fn().mockResolvedValue(cuotas.map((id) => ({ id }))),
    update: jest.fn().mockResolvedValue([0]),
  };
  const consumerPaymentsToMerchant = {
    findAll: jest.fn().mockResolvedValue(pagadas.map((installmentId) => ({ installmentId }))),
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
  const service = new B2BOverdueSweepService(repository as never, logger as never);
  return { service, installments, consumerPaymentsToMerchant };
}

describe('la pasada de cuotas BNPL vencidas', () => {
  it('marca OVERDUE las vencidas sin pago y deja en paz las que tienen pago reportado', async () => {
    const { service, installments } = build(['a', 'b', 'c'], ['b']);
    const result = await service.sweep('2026-09-14');

    expect(result).toEqual({ corte: '2026-09-14', revisadas: 3, marcadas: 2, conPago: 1 });
    expect(installments.update).toHaveBeenCalledTimes(1);
    const [patch, options] = installments.update.mock.calls[0] as [
      Record<string, unknown>,
      { where: { id: { [key: symbol]: string[] } } },
    ];
    expect(patch).toEqual({ status: 'OVERDUE' });
    expect(Object.getOwnPropertySymbols(options.where.id).map((s) => options.where.id[s])).toEqual([
      ['a', 'c'],
    ]);
  });

  it('sin vencidas no escribe nada', async () => {
    const { service, installments, consumerPaymentsToMerchant } = build([], []);
    const result = await service.sweep('2026-09-14');

    expect(result.revisadas).toBe(0);
    expect(consumerPaymentsToMerchant.findAll).not.toHaveBeenCalled();
    expect(installments.update).not.toHaveBeenCalled();
  });

  it('si todas las vencidas tienen pago, no escribe pero lo cuenta', async () => {
    const { service, installments } = build(['a'], ['a']);
    const result = await service.sweep('2026-09-14');

    expect(result).toEqual({ corte: '2026-09-14', revisadas: 1, marcadas: 0, conPago: 1 });
    expect(installments.update).not.toHaveBeenCalled();
  });
});
