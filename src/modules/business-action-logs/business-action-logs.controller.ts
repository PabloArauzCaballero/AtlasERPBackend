import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  businessActionLogQuerySchema,
  type BusinessActionLogQueryDto,
} from './business-action-logs.schemas';
import { BusinessActionLogsService } from './business-action-logs.service';

@Controller('audit/business-actions')
export class BusinessActionLogsController {
  constructor(private readonly service: BusinessActionLogsService) {}

  @Roles('ADMIN', 'AUDITOR', 'ADS_AUDITOR', 'ADS_ADMIN_MANAGER', 'FINANCE', 'accountant')
  @Get()
  list(
    @Query(new ZodValidationPipe(businessActionLogQuerySchema)) query: BusinessActionLogQueryDto,
  ) {
    return this.service.list(query);
  }
}
