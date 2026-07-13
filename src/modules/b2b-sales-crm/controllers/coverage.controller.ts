import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type {
  ApplyRecoveryPaymentDto,
  MarkPayablePaidDto,
  PayableIdParamsDto,
  RecoveryIdParamsDto,
  ScheduleCoverageDto,
} from '../b2b-sales-crm.dtos';
import {
  applyRecoveryPaymentSchema,
  markPayablePaidSchema,
  payableIdParamsSchema,
  recoveryIdParamsSchema,
  scheduleCoverageSchema,
} from '../b2b-sales-crm.schemas';
import { B2BSalesCrmService } from '../services/b2b-sales-crm.service';

@Controller('b2b/coverage')
export class CoverageController {
  constructor(private readonly service: B2BSalesCrmService) {}

  @Roles('FINANCE', 'OPERATIONS', 'ADMIN')
  @Post('payables')
  scheduleCoverage(
    @Body(new ZodValidationPipe(scheduleCoverageSchema)) body: ScheduleCoverageDto,
  ): Promise<Record<string, unknown>> {
    return this.service.scheduleCoverage(body);
  }

  @Roles('FINANCE', 'ADMIN')
  @Patch('payables/:payableId/paid')
  markPaid(
    @Param(new ZodValidationPipe(payableIdParamsSchema)) params: PayableIdParamsDto,
    @Body(new ZodValidationPipe(markPayablePaidSchema)) body: MarkPayablePaidDto,
  ): Promise<Record<string, unknown>> {
    return this.service.markPayablePaid(params.payableId, body);
  }

  @Roles('FINANCE', 'COLLECTIONS', 'ADMIN')
  @Patch('recoveries/:recoveryId/apply-payment')
  applyRecoveryPayment(
    @Param(new ZodValidationPipe(recoveryIdParamsSchema)) params: RecoveryIdParamsDto,
    @Body(new ZodValidationPipe(applyRecoveryPaymentSchema)) body: ApplyRecoveryPaymentDto,
  ): Promise<Record<string, unknown>> {
    return this.service.applyRecoveryPayment(params.recoveryId, body);
  }
}
