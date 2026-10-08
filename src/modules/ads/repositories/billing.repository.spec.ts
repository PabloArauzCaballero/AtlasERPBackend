import { ConflictException } from '@nestjs/common';
import { Op } from 'sequelize';
import { BillingRepository } from './billing.repository';

describe('BillingRepository.assertPeriodIsNotClosed', () => {
  function construir(existente: unknown) {
    const invoiceModel = { findOne: jest.fn().mockResolvedValue(existente) };
    const logger = { setContext: jest.fn() };
    const repo = new BillingRepository(
      {} as never,
      {} as never,
      invoiceModel as never,
      {} as never,
      {} as never,
      logger as never,
    );
    return { repo, invoiceModel };
  }

  it('busca facturas vivas que se SOLAPEN con el periodo, no sólo las de fechas idénticas', async () => {
    const { repo, invoiceModel } = construir(null);
    await repo.assertPeriodIsNotClosed(['a1'], '2026-09-15', '2026-10-15');
    const where = invoiceModel.findOne.mock.calls[0][0].where;
    expect(where.periodStart).toEqual({ [Op.lte]: '2026-10-15' });
    expect(where.periodEnd).toEqual({ [Op.gte]: '2026-09-15' });
    expect(where.status).toEqual({ [Op.ne]: 'VOID' });
  });

  it('rechaza con BILLING_PERIOD_ALREADY_CLOSED cuando hay una factura solapada', async () => {
    const { repo } = construir({ id: 'inv-1' });
    await expect(repo.assertPeriodIsNotClosed(['a1'], '2026-09-15', '2026-10-15')).rejects.toThrow(
      ConflictException,
    );
  });
});
