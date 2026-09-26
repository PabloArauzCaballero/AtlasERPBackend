import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../../common/types/auth-context.types';
import {
  ListDeadOutboxEventsQueryDto,
  OutboxEventKeyParamsDto,
  ReplayOutboxEventDto,
  listDeadOutboxEventsQuerySchema,
  outboxEventKeyParamsSchema,
  replayOutboxEventSchema,
} from './outbox-operations.schemas';
import { OutboxOperationsService } from './outbox-operations.service';

/**
 * Operación del outbox contable: sólo administración y finanzas. Mirar la cola ya revela qué
 * hechos contables existen, y el replay reenvía un evento a otro servicio.
 */
@Roles('ADMIN', 'CFO', 'FINANCE')
@Controller('accounting/outbox')
export class OutboxOperationsController {
  constructor(private readonly service: OutboxOperationsService) {}

  @Get('status')
  status() {
    return this.service.status();
  }

  @Get('events/dead')
  listDead(
    @Query(new ZodValidationPipe(listDeadOutboxEventsQuerySchema))
    query: ListDeadOutboxEventsQueryDto,
  ) {
    return this.service.listDead(query.limit);
  }

  @Post('events/:eventKey/replay')
  replay(
    @Param(new ZodValidationPipe(outboxEventKeyParamsSchema)) params: OutboxEventKeyParamsDto,
    @Body(new ZodValidationPipe(replayOutboxEventSchema)) body: ReplayOutboxEventDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.replay(params.eventKey, body.reason, user);
  }
}
