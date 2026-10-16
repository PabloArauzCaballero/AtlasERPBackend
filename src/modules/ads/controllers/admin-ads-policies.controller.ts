import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../../common/types/auth-context.types';
import { RequestId } from '../decorators/request-id.decorator';
import { AdminAdsService } from '../services/admin-ads.service';
import { createPolicyRuleSchema, listPoliciesQuerySchema } from '../ads.schemas';
import type { CreatePolicyRuleDto, ListPoliciesQueryDto } from '../ads.dtos';

@Controller('admin/ads')
export class AdminAdsPoliciesController {
  constructor(private readonly adminAdsService: AdminAdsService) {}

  @Get('policies')
  @Roles('ADS_ADMIN_VIEWER', 'ADS_MODERATOR', 'ADS_COMPLIANCE_ADMIN', 'ADS_AUDITOR')
  listPolicies(@Query(new ZodValidationPipe(listPoliciesQuerySchema)) query: ListPoliciesQueryDto) {
    return this.adminAdsService.listPolicies(query);
  }

  @Post('policies')
  @Roles('ADS_COMPLIANCE_ADMIN')
  createPolicy(
    @Body(new ZodValidationPipe(createPolicyRuleSchema)) body: CreatePolicyRuleDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.adminAdsService.createPolicyRule(body, { user, requestId });
  }
}
