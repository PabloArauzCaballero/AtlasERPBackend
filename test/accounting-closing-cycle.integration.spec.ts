/**
 * WP14-ERPB · Cerrar → reabrir → cerrar el mismo período, contra PostgreSQL real y migrado.
 *
 * Antes, el segundo cierre del mismo `closeType` chocaba dos veces con la base: `close_run` es
 * único por (entidad, período, tipo) y la clave del evento (`period-closed-<período>-<tipo>`) con
 * `event_outbox.event_key UNIQUE`. La transacción se deshacía y el período quedaba ABIERTO para
 * siempre. Además la reapertura escribía en `closed_by` a quien reabría, borrando quién cerró.
 */
import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import type { Sequelize } from 'sequelize-typescript';
import type { AuthUser } from '../src/common/types/auth-context.types';
import type { ClosingService } from '../src/modules/accounting/closing/services/closing.service';
import { describeWithDatabase } from './integration/database';

describeWithDatabase(
  'cierre contable: cerrar, reabrir y volver a cerrar (PostgreSQL real)',
  (url) => {
    let moduleRef: TestingModule;
    let sequelize: Sequelize;
    let closing: ClosingService;
    const cierra: AuthUser = { sub: randomUUID(), role: 'cfo', roles: ['cfo'] };
    const cfo = (legalEntityId: string): AuthUser => ({
      ...cierra,
      legalEntityIds: [legalEntityId],
    });
    const reabre: AuthUser = { sub: randomUUID(), role: 'admin', roles: ['admin'] };

    async function sql<T = Record<string, unknown>>(
      query: string,
      replacements: Record<string, unknown> = {},
    ): Promise<T[]> {
      const [rows] = await sequelize.query(query, { replacements });
      return rows as T[];
    }

    beforeAll(async () => {
      process.env.DATABASE_URL = url;
      process.env.STARTUP_MIGRATIONS_ENABLED = 'false';
      process.env.STARTUP_SEEDS_ENABLED = 'false';
      process.env.DB_SSL ??= 'false';
      const { Test } = await import('@nestjs/testing');
      const { getConnectionToken } = await import('@nestjs/sequelize');
      const { DatabaseModule } = await import('../src/database/sequelize.module');
      const { ObservabilityModule } =
        await import('../src/common/observability/observability.module');
      const { PinoLoggerModule } = await import('../src/common/logging/pino-logger.module');
      const { LoggerModule } = await import('../src/common/logger/logger.module');
      const { AccountingModule } = await import('../src/modules/accounting/accounting.module');
      const closingModule =
        await import('../src/modules/accounting/closing/services/closing.service');
      moduleRef = await Test.createTestingModule({
        imports: [
          ObservabilityModule,
          PinoLoggerModule,
          LoggerModule,
          DatabaseModule,
          AccountingModule,
        ],
      }).compile();
      await moduleRef.init();
      sequelize = moduleRef.get(getConnectionToken());
      closing = moduleRef.get(closingModule.ClosingService);
    });

    afterAll(async () => {
      await moduleRef?.close();
    });

    async function periodo(): Promise<{ legalEntityId: string; periodId: string }> {
      const s = randomUUID().slice(0, 8).toUpperCase();
      const legalEntityId = randomUUID();
      const fiscalYearId = randomUUID();
      const periodId = randomUUID();
      await sql(
        `INSERT INTO atlas_accounting.legal_entity (id, code, legal_name, base_currency)
       VALUES (:le, :code, 'Entidad cierre', 'BOB')`,
        { le: legalEntityId, code: `CL${s}` },
      );
      await sql(
        `INSERT INTO atlas_accounting.fiscal_year (id, legal_entity_id, year_label, start_date, end_date)
       VALUES (:fy, :le, '2031', '2031-01-01', '2031-12-31')`,
        { fy: fiscalYearId, le: legalEntityId },
      );
      await sql(
        `INSERT INTO atlas_accounting.accounting_period (id, fiscal_year_id, period_no, start_date, end_date)
       VALUES (:p, :fy, 3, '2031-03-01', '2031-03-31')`,
        { p: periodId, fy: fiscalYearId },
      );
      return { legalEntityId, periodId };
    }

    const estado = async (periodId: string) =>
      (
        await sql<{ is_open: boolean; close_status: string; closed_by: string | null }>(
          'SELECT is_open, close_status, closed_by FROM atlas_accounting.accounting_period WHERE id = :periodId',
          { periodId },
        )
      )[0];

    it('el segundo cierre del mismo tipo cierra el período, con su propio evento y sin perder el primero', async () => {
      const { legalEntityId, periodId } = await periodo();
      const cierre = { legalEntityId, periodId, closeType: 'MONTHLY' as const };

      const primero = await closing.closePeriod(cierre, cfo(legalEntityId));
      expect(await estado(periodId)).toMatchObject({ is_open: false, closed_by: cierra.sub });

      const reapertura = await closing.reopenPeriod(
        { periodId, reason: 'Falta un asiento de ajuste' },
        reabre,
      );
      expect(reapertura.reopen).toMatchObject({
        reopenedBy: reabre.sub,
        approval: 'SINGLE_AUTHORIZED_ROLE',
        voidedCloseRunIds: [primero.id],
      });
      // Abierto y sin atribuir el cierre a quien reabrió.
      expect(await estado(periodId)).toMatchObject({ is_open: true, closed_by: null });

      const segundo = await closing.closePeriod(cierre, cfo(legalEntityId));
      expect(await estado(periodId)).toMatchObject({
        is_open: false,
        close_status: 'CLOSED',
        closed_by: cierra.sub,
      });

      const eventos = await sql<{ event_key: string }>(
        `SELECT event_key FROM atlas_accounting.event_outbox
        WHERE aggregate_id = :periodId AND topic = 'accounting.period.closed' ORDER BY created_at`,
        { periodId },
      );
      expect(eventos.map((e) => e.event_key)).toEqual([
        `period-closed-${primero.id}-1`,
        `period-closed-${segundo.id}-2`,
      ]);

      const [run] = await sql<{ status: string; control_report_json: Record<string, unknown> }>(
        'SELECT status, control_report_json FROM atlas_accounting.close_run WHERE period_id = :periodId',
        { periodId },
      );
      expect(run?.status).toBe('COMPLETED');
      expect(run?.control_report_json).toMatchObject({
        closedBy: cierra.sub,
        closeNumber: 2,
        previousCloses: [
          {
            closeNumber: 1,
            status: 'VOID',
            closedBy: cierra.sub,
            reopenedBy: reabre.sub,
            reopenReason: 'Falta un asiento de ajuste',
          },
        ],
      });

      const registro = await sql<{ action_code: string; actor_user_id: string }>(
        `SELECT action_code, actor_user_id FROM atlas_audit.business_action_logs
        WHERE aggregate_type = 'ACCOUNTING_PERIOD' AND aggregate_id = :periodId ORDER BY created_at`,
        { periodId },
      );
      expect(registro).toEqual([
        { action_code: 'CLOSE_ACCOUNTING_PERIOD', actor_user_id: cierra.sub },
        { action_code: 'REOPEN_ACCOUNTING_PERIOD', actor_user_id: reabre.sub },
        { action_code: 'CLOSE_ACCOUNTING_PERIOD', actor_user_id: cierra.sub },
      ]);
    });

    it('reintentar el MISMO cierre no duplica el evento: el período ya está cerrado (409)', async () => {
      const { legalEntityId, periodId } = await periodo();
      const cierre = { legalEntityId, periodId, closeType: 'ANNUAL' as const };
      await closing.closePeriod(cierre, cfo(legalEntityId));
      await expect(closing.closePeriod(cierre, cfo(legalEntityId))).rejects.toBeInstanceOf(
        ConflictException,
      );
      const [n] = await sql<{ n: string }>(
        `SELECT count(*)::text AS n FROM atlas_accounting.event_outbox
        WHERE aggregate_id = :periodId AND topic = 'accounting.period.closed'`,
        { periodId },
      );
      expect(n?.n).toBe('1');
    });

    it('el informe de cierre dice qué controles se evalúan de verdad', async () => {
      const { legalEntityId, periodId } = await periodo();
      const run = await closing.closePeriod(
        { legalEntityId, periodId, closeType: 'MONTHLY' },
        cfo(legalEntityId),
      );
      const controles = (run.controlReportJson.controls ?? []) as {
        code: string;
        evaluation: string;
      }[];
      expect(Object.fromEntries(controles.map((c) => [c.code, c.evaluation]))).toEqual({
        PERIOD_HAS_DRAFT_DOCUMENTS: 'ENFORCED',
        PERIOD_HAS_OPEN_RECONCILIATION_ITEMS: 'NO_DATA_SOURCE',
        PERIOD_HAS_UNMATCHED_BANK_STATEMENT_LINES: 'NO_DATA_SOURCE',
        PENDING_OUTBOX_EVENTS: 'INFORMATIVE',
      });
    });
  },
);
