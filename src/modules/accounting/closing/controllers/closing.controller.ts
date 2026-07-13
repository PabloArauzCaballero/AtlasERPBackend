import { Body, Controller, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../../../common/types/auth-context.types';
import {
  ClosePeriodDto,
  ReopenPeriodDto,
  closePeriodSchema,
  reopenPeriodSchema,
} from '../../shared/schemas/accounting.schemas';
import { ClosingService } from '../services/closing.service';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

@Roles('admin', 'cfo')
@Controller('accounting/closings')
export class ClosingController {
  constructor(
    private readonly service: ClosingService,
    private readonly logger: PinoLoggerService,
  ) {}

  @Post('periods/close')
  closePeriod(
    @Body(new ZodValidationPipe(closePeriodSchema)) body: ClosePeriodDto,
    @CurrentUser() user: AuthUser,
  ) {
    this.logger.info('Endpoint closePeriod recibido.', {
      layer: 'controller',
      module: 'closing',
      action: 'closePeriod',
      periodId: body.periodId,
      legalEntityId: body.legalEntityId,
      closeType: body.closeType,
      userId: user.sub,
    });
    return this.service.closePeriod(body, user);
  }

  @Patch('periods/reopen')
  reopenPeriod(
    @Body(new ZodValidationPipe(reopenPeriodSchema)) body: ReopenPeriodDto,
    @CurrentUser() user: AuthUser,
  ) {
    this.logger.warn('Endpoint reopenPeriod recibido.', {
      layer: 'controller',
      module: 'closing',
      action: 'reopenPeriod',
      periodId: body.periodId,
      userId: user.sub,
    });
    return this.service.reopenPeriod(body, user);
  }
}
