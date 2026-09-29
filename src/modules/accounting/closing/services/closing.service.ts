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
import { BusinessActionLogsService } from '../../../business-action-logs/business-action-logs.service';

/** Lo que queda de un cierre anterior del mismo período y tipo cuando se vuelve a cerrar. */
interface CierreAnterior {
  closeNumber: number;
  status: string;
  completedAt: Date | string | null;
  closedBy: unknown;
  reopenedBy: unknown;
  reopenedAt: unknown;
  reopenReason: unknown;
}

/**
 * Cierre y reapertura de períodos.
 *
 * Qué hace de verdad (WP14-ERPB):
 * - Cerrar congela el período tras los controles de `ClosingControlService` (hoy sólo bloquean los
 *   documentos en borrador; ver la descripción de cada control en el informe). `closeType`
 *   (`MONTHLY`/`ANNUAL`) es una etiqueta del cierre: los dos hacen lo mismo. El cierre anual NO
 *   liquida el IUE ni traslada el resultado del ejercicio.
 * - Reabrir lo hace UN rol autorizado (`admin` o `cfo`) con motivo obligatorio. No hay doble
 *   aprobación. Quién cerró y quién reabrió queda en `close_run.control_report_json` y en
 *   `atlas_audit.business_action_logs`.
 * - `close_run` es único por (entidad, período, tipo): volver a cerrar tras una reapertura reutiliza
 *   esa fila y guarda los cierres anteriores en `previousCloses`. Cada cierre publica su propio
 *   evento (`period-closed-<closeRunId>-<n>`): antes la clave era la misma en cada cierre, chocaba
 *   con `event_outbox.event_key UNIQUE` y el período quedaba abierto para siempre.
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
    private readonly businessActionLogsService: BusinessActionLogsService,
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

      const completedAt = new Date();
      const anterior = await this.closeRunModel.findOne({
        where: {
          legalEntityId: input.legalEntityId,
          periodId: input.periodId,
          closeType: input.closeType,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const previousCloses = anterior ? this.historialDeCierres(anterior) : [];
      const closeNumber = previousCloses.length + 1;
      const controlReportJson = {
        ...controlReport,
        closedBy: user.sub,
        closeNumber,
        previousCloses,
      };
      const closeRun = anterior
        ? await anterior.update(
            { status: 'COMPLETED', startedAt: completedAt, completedAt, controlReportJson },
            { transaction },
          )
        : await this.closeRunModel.create(
            {
              legalEntityId: input.legalEntityId,
              periodId: input.periodId,
              closeType: input.closeType,
              status: 'COMPLETED',
              completedAt,
              controlReportJson,
            },
            { transaction },
          );

      await period.update(
        {
          isOpen: false,
          closeStatus: 'CLOSED',
          closedAt: completedAt,
          closedBy: user.sub,
        },
        { transaction },
      );

      await this.eventOutboxModel.create(
        {
          topic: 'accounting.period.closed',
          aggregateType: 'accounting_period',
          aggregateId: input.periodId,
          eventKey: `period-closed-${closeRun.id}-${closeNumber}`,
          payload: {
            closeRunId: closeRun.id,
            periodId: input.periodId,
            closeType: input.closeType,
            closeNumber,
          },
        },
        { transaction },
      );

      await this.businessActionLogsService.record({
        moduleCode: 'ACCOUNTING',
        businessProcess: 'PERIOD_CLOSE',
        actionCode: 'CLOSE_ACCOUNTING_PERIOD',
        actorUserId: user.sub,
        actorRole: user.role ?? null,
        aggregateType: 'ACCOUNTING_PERIOD',
        aggregateId: input.periodId,
        affectedTables: [
          'atlas_accounting.close_run',
          'atlas_accounting.accounting_period',
          'atlas_accounting.event_outbox',
        ],
        affectedRecordCount: 3,
        status: 'SUCCESS',
        inputSummary: { legalEntityId: input.legalEntityId, closeType: input.closeType },
        outputSummary: { closeRunId: closeRun.id, closeNumber },
        transaction,
      });

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

      // El cierre que se deshace no se pierde: queda anulado (VOID) en su `close_run` con quién
      // lo reabrió, cuándo y por qué, y en el registro de actividad. `closedBy` del período vuelve
      // a NULL —está abierto, nadie lo tiene cerrado— en vez de pasar a nombre de quien reabre.
      const reopenedAt = new Date();
      const cierresAnulados = await this.closeRunModel.findAll({
        where: { periodId: input.periodId, status: 'COMPLETED' },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      for (const cierre of cierresAnulados) {
        await cierre.update(
          {
            status: 'VOID',
            controlReportJson: {
              ...cierre.controlReportJson,
              reopenedBy: user.sub,
              reopenedAt: reopenedAt.toISOString(),
              reopenReason: input.reason,
            },
          },
          { transaction },
        );
      }
      const previousClosedBy = period.closedBy;
      const previousClosedAt = period.closedAt;

      await period.update(
        { isOpen: true, closeStatus: 'OPEN', closedAt: null, closedBy: null },
        { transaction },
      );

      await this.eventOutboxModel.create(
        {
          topic: 'accounting.period.reopened',
          aggregateType: 'accounting_period',
          aggregateId: input.periodId,
          eventKey: `period-reopened-${input.periodId}-${reopenedAt.getTime()}`,
          payload: { reason: input.reason, reopenedBy: user.sub },
        },
        { transaction },
      );

      await this.businessActionLogsService.record({
        moduleCode: 'ACCOUNTING',
        businessProcess: 'PERIOD_CLOSE',
        actionCode: 'REOPEN_ACCOUNTING_PERIOD',
        actorUserId: user.sub,
        actorRole: user.role ?? null,
        aggregateType: 'ACCOUNTING_PERIOD',
        aggregateId: input.periodId,
        affectedTables: [
          'atlas_accounting.close_run',
          'atlas_accounting.accounting_period',
          'atlas_accounting.event_outbox',
        ],
        affectedRecordCount: cierresAnulados.length + 2,
        status: 'SUCCESS',
        inputSummary: { reason: input.reason },
        outputSummary: {
          previousClosedBy,
          previousClosedAt,
          voidedCloseRunIds: cierresAnulados.map((cierre) => cierre.id),
          approval: 'SINGLE_AUTHORIZED_ROLE',
        },
        transaction,
      });

      this.logger.warn('Período reabierto.', {
        layer: 'service',
        module: 'closing',
        action: 'reopenPeriod',
        periodId: input.periodId,
        userId: user.sub,
      });
      // Misma forma que antes (el período) más `reopen`, que dice lo que se hizo: un rol
      // autorizado con motivo, sin doble aprobación.
      return {
        ...period.get({ plain: true }),
        reopen: {
          reopenedBy: user.sub,
          reason: input.reason,
          approval: 'SINGLE_AUTHORIZED_ROLE',
          voidedCloseRunIds: cierresAnulados.map((cierre) => cierre.id),
        },
      };
    });
  }

  private historialDeCierres(anterior: CloseRunModel): CierreAnterior[] {
    const informe = anterior.controlReportJson ?? {};
    const previos = Array.isArray(informe.previousCloses)
      ? (informe.previousCloses as CierreAnterior[])
      : [];
    return [
      ...previos,
      {
        closeNumber:
          typeof informe.closeNumber === 'number' ? informe.closeNumber : previos.length + 1,
        status: anterior.status,
        completedAt: anterior.completedAt,
        closedBy: informe.closedBy ?? null,
        reopenedBy: informe.reopenedBy ?? null,
        reopenedAt: informe.reopenedAt ?? null,
        reopenReason: informe.reopenReason ?? null,
      },
    ];
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
