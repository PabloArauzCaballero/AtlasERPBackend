import { Controller, Get, Query } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { AdminAdsService } from '../services/admin-ads.service';
import { AdsAuditService } from '../services/audit.service';
import { auditQuerySchema, dashboardQuerySchema } from '../ads.schemas';
import type { AuditQueryDto, DashboardQueryDto } from '../ads.dtos';

@Controller('admin/ads')
export class AdminAdsOversightController {
  constructor(
    private readonly adminAdsService: AdminAdsService,
    private readonly auditService: AdsAuditService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AdminAdsOversightController.name);
  }

  @Get('dashboard')
  @Roles(
    'ADS_ADMIN_VIEWER',
    'ADS_ADMIN_MANAGER',
    'ADS_ADMIN_OPERATOR',
    'ADS_FINANCE',
    'ADS_AUDITOR',
  )
  getDashboard(@Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQueryDto) {
    this.logger.debug({ query }, 'Admin dashboard requested');
    return this.adminAdsService.getDashboard(query);
  }

  @Get('audit')
  @Roles('ADS_AUDITOR', 'ADS_ADMIN_MANAGER', 'ADS_FINANCE')
  listAudit(@Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQueryDto) {
    return this.auditService.list(query);
  }
}
