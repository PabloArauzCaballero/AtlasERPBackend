import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { env } from '../../../config/env';
import { sequelizeQueryable } from '../../../common/events/queryable';
import { PinoLoggerService } from '../../../common/logger/pino-logger.service';
import type { AuthUser } from '../../../common/types/auth-context.types';
import {
  listDeadEvents,
  readOutboxStatus,
  replayEvent,
} from '../../../workers/outbox/outbox-operations';
import { BusinessActionLogsService } from '../../business-action-logs/business-action-logs.service';

/**
 * Monitor y replay del outbox contable (UC_MonitorearEventos, UC_ReintentoEvento).
 *
 * `transportConfigured: false` es la respuesta honesta cuando el worker no tiene a quién entregar:
 * en ese estado nada se marca publicado y la cola sólo crece.
 */
@Injectable()
export class OutboxOperationsService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly businessActionLogsService: BusinessActionLogsService,
    private readonly logger: PinoLoggerService,
  ) {}

  async status() {
    const report = await readOutboxStatus(sequelizeQueryable(this.sequelize));
    return {
      transportConfigured: Boolean(env.OUTBOX_DELIVERY_URL && env.OUTBOX_DELIVERY_SIGNING_SECRET),
      maxAttempts: env.OUTBOX_MAX_ATTEMPTS,
      ...report,
    };
  }

  listDead(limit: number) {
    return listDeadEvents(sequelizeQueryable(this.sequelize), limit);
  }

  replay(eventKey: string, reason: string, user: AuthUser) {
    return this.sequelize.transaction(async (transaction) => {
      const result = await replayEvent(sequelizeQueryable(this.sequelize, transaction), eventKey);
      if (result.outcome === 'NOT_FOUND') {
        throw new NotFoundException({
          code: 'OUTBOX_EVENT_NOT_FOUND',
          message: 'No existe un evento con esa clave.',
        });
      }
      if (result.outcome === 'NOT_REPLAYABLE') {
        throw new ConflictException({
          code: 'OUTBOX_EVENT_NOT_REPLAYABLE',
          message: `Sólo se reenvían eventos agotados (DEAD) o nunca entregados (LEGACY_LOG_ONLY); este está ${result.status}.`,
        });
      }

      await this.businessActionLogsService.record({
        moduleCode: 'ACCOUNTING',
        businessProcess: 'EVENT_OUTBOX_OPERATIONS',
        actionCode: 'REPLAY_OUTBOX_EVENT',
        actorUserId: user.sub,
        actorRole: user.role ?? null,
        aggregateType: 'EVENT_OUTBOX',
        aggregateId: eventKey,
        affectedTables: ['atlas_accounting.event_outbox'],
        affectedRecordCount: 1,
        status: 'SUCCESS',
        inputSummary: { eventKey, reason },
        outputSummary: {
          previousStatus: result.previousStatus,
          previousAttempts: result.previousAttempts,
          previousPublishedAt: result.previousPublishedAt,
          replayCount: result.replayCount,
        },
        transaction,
      });

      this.logger.warn('Replay autorizado de evento outbox.', {
        layer: 'service',
        module: 'outbox-operations',
        action: 'replay',
        eventKey,
        previousStatus: result.previousStatus,
        replayCount: result.replayCount,
        userId: user.sub,
      });
      return result;
    });
  }
}
