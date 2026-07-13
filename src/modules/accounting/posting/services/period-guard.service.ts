import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import { AccountingPeriodModel } from '../../../../database/models';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

@Injectable()
export class PeriodGuardService {
  constructor(
    private readonly logger: PinoLoggerService,
    @InjectModel(AccountingPeriodModel)
    private readonly accountingPeriodModel: typeof AccountingPeriodModel,
  ) {}

  async assertPeriodIsOpen(
    periodId: string,
    transaction?: Transaction,
  ): Promise<AccountingPeriodModel> {
    this.logger.debug('Validando período abierto.', {
      layer: 'service',
      service: 'PeriodGuardService',
      action: 'assertPeriodIsOpen',
      periodId,
      insideTransaction: Boolean(transaction),
    });

    const findOptions = transaction ? { transaction } : undefined;
    const period = await this.accountingPeriodModel.findByPk(periodId, findOptions);

    if (!period) {
      this.logger.warn('Período contable no encontrado.', {
        layer: 'service',
        service: 'PeriodGuardService',
        action: 'assertPeriodIsOpen',
        periodId,
      });
      throw new NotFoundException({
        code: 'ACCOUNTING_PERIOD_NOT_FOUND',
        message: 'El período contable no existe.',
      });
    }

    if (!period.isOpen || period.closeStatus !== 'OPEN') {
      this.logger.warn('Período contable cerrado bloqueó operación.', {
        layer: 'service',
        service: 'PeriodGuardService',
        action: 'assertPeriodIsOpen',
        periodId,
        closeStatus: period.closeStatus,
        isOpen: period.isOpen,
      });
      throw new ConflictException({
        code: 'ACCOUNTING_PERIOD_CLOSED',
        message: 'El período contable está cerrado y no permite contabilizaciones.',
      });
    }

    this.logger.debug('Período contable abierto validado.', {
      layer: 'service',
      service: 'PeriodGuardService',
      action: 'assertPeriodIsOpen',
      periodId,
    });
    return period;
  }
}
