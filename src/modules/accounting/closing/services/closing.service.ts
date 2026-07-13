import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  AccountingPeriodModel,
  CloseRunModel,
  EventOutboxModel,
  FiscalYearModel,
} from '../../../../database/models';
import { LegalEntityAccessService } from '../../../../common/services/legal-entity-access.service';
import { AuthUser } from '../../../../common/types/auth-context.types';
import { ClosePeriodDto, ReopenPeriodDto } from '../../shared/schemas/accounting.schemas';
import { ClosingControlService } from './closing-control.service';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

/**
 * Gestiona cierre y reapertura de períodos con controles SAP-like mínimos.
 */
@Injectable()
export class ClosingService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly closingControlService: ClosingControlService,
    private readonly legalEntityAccessService: LegalEntityAccessService,
    private readonly logger: PinoLoggerService,
    @InjectModel(AccountingPeriodModel)
    private readonly accountingPeriodModel: typeof AccountingPeriodModel,
    @InjectModel(CloseRunModel)
    private readonly closeRunModel: typeof CloseRunModel,
    @InjectModel(FiscalYearModel)
    private readonly fiscalYearModel: typeof FiscalYearModel,
    @InjectModel(EventOutboxModel)
    private readonly eventOutboxModel: typeof EventOutboxModel,
  ) {}

  closePeriod(input: ClosePeriodDto, user: AuthUser) {
    this.logger.info('Iniciando cierre de período.', {
      layer: 'service',
      module: 'closing',
      action: 'closePeriod',
      periodId: input.periodId,
      legalEntityId: input.legalEntityId,
      closeType: input.closeType,
      userId: user.sub,
    });
    return this.sequelize.transaction(async (transaction) => {
      const period = await this.accountingPeriodModel.findByPk(input.periodId, { transaction });

      if (!period) {
        throw new NotFoundException({
          code: 'ACCOUNTING_PERIOD_NOT_FOUND',
          message: 'El período contable no existe.',
        });
      }

      await this.assertPeriodBelongsToLegalEntity(period, input.legalEntityId, transaction);
      this.legalEntityAccessService.assertCanAccessLegalEntity(user, input.legalEntityId);

      if (!period.isOpen || period.closeStatus !== 'OPEN') {
        throw new ConflictException({
          code: 'ACCOUNTING_PERIOD_ALREADY_CLOSED',
          message: 'El período contable no está abierto para cierre.',
        });
      }

      const controlReport = await this.closingControlService.buildCloseControlReport(
        input.periodId,
        transaction,
      );
      if (controlReport.blockers.length > 0) {
        throw new ConflictException({
          code: 'PERIOD_CLOSE_CONTROLS_FAILED',
          message: 'No se puede cerrar el período porque existen controles pendientes.',
          details: controlReport,
        });
      }

      const closeRun = await this.closeRunModel.create(
        {
          legalEntityId: input.legalEntityId,
          periodId: input.periodId,
          closeType: input.closeType,
          status: 'COMPLETED',
          completedAt: new Date(),
          controlReportJson: { ...controlReport, closedBy: user.sub },
        },
        { transaction },
      );

      await period.update(
        {
          isOpen: false,
          closeStatus: 'CLOSED',
          closedAt: new Date(),
          closedBy: user.sub,
        },
        { transaction },
      );

      await this.eventOutboxModel.create(
        {
          topic: 'accounting.period.closed',
          aggregateType: 'accounting_period',
          aggregateId: input.periodId,
          eventKey: `period-closed-${input.periodId}-${input.closeType}`,
          payload: {
            closeRunId: closeRun.id,
            periodId: input.periodId,
            closeType: input.closeType,
          },
        },
        { transaction },
      );

      this.logger.info('Período cerrado correctamente.', {
        layer: 'service',
        module: 'closing',
        action: 'closePeriod',
        closeRunId: closeRun.id,
        periodId: input.periodId,
        closeType: input.closeType,
      });
      return closeRun;
    });
  }

  reopenPeriod(input: ReopenPeriodDto, user: AuthUser) {
    this.logger.warn('Iniciando reapertura de período.', {
      layer: 'service',
      module: 'closing',
      action: 'reopenPeriod',
      periodId: input.periodId,
      userId: user.sub,
    });
    return this.sequelize.transaction(async (transaction) => {
      const period = await this.accountingPeriodModel.findByPk(input.periodId, { transaction });

      if (!period) {
        throw new NotFoundException({
          code: 'ACCOUNTING_PERIOD_NOT_FOUND',
          message: 'El período contable no existe.',
        });
      }

      const legalEntityId = await this.getPeriodLegalEntityId(period, transaction);
      this.legalEntityAccessService.assertCanAccessLegalEntity(user, legalEntityId);

      if (period.isOpen && period.closeStatus === 'OPEN') {
        throw new ConflictException({
          code: 'ACCOUNTING_PERIOD_ALREADY_OPEN',
          message: 'El período contable ya está abierto.',
        });
      }

      await period.update(
        { isOpen: true, closeStatus: 'OPEN', closedAt: null, closedBy: user.sub },
        { transaction },
      );

      await this.eventOutboxModel.create(
        {
          topic: 'accounting.period.reopened',
          aggregateType: 'accounting_period',
          aggregateId: input.periodId,
          eventKey: `period-reopened-${input.periodId}-${Date.now()}`,
          payload: { reason: input.reason, reopenedBy: user.sub },
        },
        { transaction },
      );

      this.logger.warn('Período reabierto.', {
        layer: 'service',
        module: 'closing',
        action: 'reopenPeriod',
        periodId: input.periodId,
        userId: user.sub,
      });
      return period;
    });
  }

  private async assertPeriodBelongsToLegalEntity(
    period: AccountingPeriodModel,
    expectedLegalEntityId: string,
    transaction: Transaction,
  ): Promise<void> {
    const legalEntityId = await this.getPeriodLegalEntityId(period, transaction);
    if (legalEntityId !== expectedLegalEntityId) {
      throw new ConflictException({
        code: 'CLOSE_RUN_LEGAL_ENTITY_PERIOD_MISMATCH',
        message: 'El período no pertenece a la entidad legal indicada para el cierre.',
      });
    }
  }

  private async getPeriodLegalEntityId(
    period: AccountingPeriodModel,
    transaction: Transaction,
  ): Promise<string> {
    const fiscalYear = await this.fiscalYearModel.findByPk(period.fiscalYearId, { transaction });
    if (!fiscalYear) {
      throw new NotFoundException({
        code: 'FISCAL_YEAR_NOT_FOUND',
        message: 'El año fiscal asociado al período no existe.',
      });
    }
    return fiscalYear.legalEntityId;
  }
}
