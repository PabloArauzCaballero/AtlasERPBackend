import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../../common/types/auth-context.types';
import { RequestId } from '../decorators/request-id.decorator';
import { AdsModerationService } from '../services/moderation.service';
import {
  moderationDecisionSchema,
  moderationQueueQuerySchema,
  reviewIdParamSchema,
} from '../ads.schemas';
import type { ModerationDecisionDto, ModerationQueueQueryDto, ReviewIdParamDto } from '../ads.dtos';

@Controller('admin/ads')
export class AdminAdsModerationController {
  constructor(private readonly moderationService: AdsModerationService) {}

  @Get('moderation/queue')
  @Roles('ADS_ADMIN_VIEWER', 'ADS_MODERATOR', 'ADS_COMPLIANCE_ADMIN', 'ADS_AUDITOR')
  listModerationQueue(
    @Query(new ZodValidationPipe(moderationQueueQuerySchema)) query: ModerationQueueQueryDto,
  ) {
    return this.moderationService.listQueue(query);
  }

  @Post('moderation/:reviewId/decision')
  @Roles('ADS_MODERATOR', 'ADS_COMPLIANCE_ADMIN')
  decideModeration(
    @Param(new ZodValidationPipe(reviewIdParamSchema)) params: ReviewIdParamDto,
    @Body(new ZodValidationPipe(moderationDecisionSchema)) body: ModerationDecisionDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.moderationService.decide(params.reviewId, body, { user, requestId });
  }
}
