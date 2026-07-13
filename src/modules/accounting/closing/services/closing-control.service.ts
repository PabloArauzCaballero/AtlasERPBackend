import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { AccountingDocumentModel, AccountingPeriodModel } from '../../../../database/models';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

export interface CloseControlReport {
  draftDocumentCount: number;
  openReconciliationItemCount: number;
  unmatchedBankStatementLineCount: number;
  pendingOutboxEventCount: number;
  blockers: string[];
}

/**
 * Ejecuta controles mínimos de cierre antes de congelar un período.
 *
 * No reemplaza el cierre contable completo, pero impide cerrar con partidas obvias abiertas
 * en mayor, conciliación y bancos.
 */
@Injectable()
export class ClosingControlService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly logger: PinoLoggerService,
    @InjectModel(AccountingDocumentModel)
    private readonly accountingDocumentModel: typeof AccountingDocumentModel,
    @InjectModel(AccountingPeriodModel)
    private readonly accountingPeriodModel: typeof AccountingPeriodModel,
  ) {}

  /**
   * Evalúa bloqueos de cierre para el período informado.
   *
   * @param periodId - Período contable a cerrar.
   * @param transaction - Transacción del cierre.
   * @returns Reporte de controles y bloqueos.
   */
  async buildCloseControlReport(
    periodId: string,
    transaction: Transaction,
  ): Promise<CloseControlReport> {
    this.logger.info('Construyendo reporte de controles de cierre.', {
      layer: 'service',
      module: 'closing',
      service: 'ClosingControlService',
      action: 'buildCloseControlReport',
      periodId,
    });
    const period = await this.accountingPeriodModel.findByPk(periodId, { transaction });

    const draftDocumentCount = await this.accountingDocumentModel.count({
      where: { accountingPeriodId: periodId, status: 'DRAFT' },
      transaction,
    });

    const openReconciliationItemCount = await this.countOpenReconciliationItems(
      periodId,
      transaction,
    );
    const unmatchedBankStatementLineCount = period
      ? await this.countUnmatchedBankStatementLines(period.startDate, period.endDate, transaction)
      : 0;
    const pendingOutboxEventCount = await this.countPendingOutboxEvents(transaction);

    const blockers: string[] = [];
    if (draftDocumentCount > 0) blockers.push('PERIOD_HAS_DRAFT_DOCUMENTS');
    if (openReconciliationItemCount > 0) blockers.push('PERIOD_HAS_OPEN_RECONCILIATION_ITEMS');
    if (unmatchedBankStatementLineCount > 0)
      blockers.push('PERIOD_HAS_UNMATCHED_BANK_STATEMENT_LINES');

    this.logger.info('Reporte de controles de cierre construido.', {
      layer: 'service',
      module: 'closing',
      service: 'ClosingControlService',
      action: 'buildCloseControlReport',
      periodId,
      blockerCount: blockers.length,
      draftDocumentCount,
      openReconciliationItemCount,
      unmatchedBankStatementLineCount,
      pendingOutboxEventCount,
    });

    return {
      draftDocumentCount,
      openReconciliationItemCount,
      unmatchedBankStatementLineCount,
      pendingOutboxEventCount,
      blockers,
    };
  }

  private async countOpenReconciliationItems(
    periodId: string,
    transaction: Transaction,
  ): Promise<number> {
    const [result] = await this.sequelize.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM atlas_accounting.reconciliation_item item
        INNER JOIN atlas_accounting.reconciliation_run run
          ON run.id = item.reconciliation_run_id
        WHERE run.period_id = :periodId
          AND item.status NOT IN ('MATCHED', 'RESOLVED', 'APPROVED')
      `,
      { replacements: { periodId }, transaction, type: QueryTypes.SELECT },
    );

    return Number(result?.count ?? 0);
  }

  private async countUnmatchedBankStatementLines(
    startDate: Date | string,
    endDate: Date | string,
    transaction: Transaction,
  ): Promise<number> {
    const [result] = await this.sequelize.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM atlas_accounting.bank_statement_line line
        INNER JOIN atlas_accounting.bank_statement statement
          ON statement.id = line.bank_statement_id
        WHERE statement.statement_date BETWEEN :startDate AND :endDate
          AND line.match_status NOT IN ('MATCHED', 'APPROVED_IGNORED')
      `,
      {
        replacements: { startDate: this.toDateOnly(startDate), endDate: this.toDateOnly(endDate) },
        transaction,
        type: QueryTypes.SELECT,
      },
    );

    return Number(result?.count ?? 0);
  }

  private async countPendingOutboxEvents(transaction: Transaction): Promise<number> {
    const [result] = await this.sequelize.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM atlas_accounting.event_outbox
        WHERE published_at IS NULL
      `,
      { transaction, type: QueryTypes.SELECT },
    );

    return Number(result?.count ?? 0);
  }

  private toDateOnly(value: Date | string): string {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return value.slice(0, 10);
  }
}
