import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../../common/types/auth-context.types';
import type { RunReconciliationDto } from '../b2b-sales-crm.dtos';
import { runReconciliationSchema } from '../b2b-sales-crm.schemas';
import { B2BSalesCrmService } from '../services/b2b-sales-crm.service';

@Controller('b2b/reconciliation')
export class ReconciliationController {
  constructor(private readonly service: B2BSalesCrmService) {}

  @Roles('FINANCE', 'OPERATIONS', 'ADMIN')
  @Post('runs')
  run(
    @Body(new ZodValidationPipe(runReconciliationSchema)) body: RunReconciliationDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.service.runReconciliation(body, user);
  }
}
