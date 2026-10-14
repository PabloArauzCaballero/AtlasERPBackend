import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../../common/types/auth-context.types';
import type { RunReconciliationDto } from '../b2b-sales-crm.dtos';
import { runReconciliationSchema } from '../b2b-sales-crm.schemas';
import { B2BReconciliationService } from '../services/b2b-reconciliation.service';

@Controller('b2b/reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliation: B2BReconciliationService) {}

  @Roles('FINANCE', 'OPERATIONS', 'ADMIN')
  @Post('runs')
  run(
    @Body(new ZodValidationPipe(runReconciliationSchema)) body: RunReconciliationDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.reconciliation.runReconciliation(body, user);
  }
}
