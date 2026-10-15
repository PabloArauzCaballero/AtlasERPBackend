import type { AuthUser } from '../../../common/types/auth-context.types';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type {
  CreateOpportunityDto,
  IdParamsDto,
  ListOpportunitiesQueryDto,
  MoveOpportunityStageDto,
} from '../b2b-sales-crm.dtos';
import {
  createOpportunitySchema,
  idParamsSchema,
  listOpportunitiesQuerySchema,
  moveOpportunityStageSchema,
} from '../b2b-sales-crm.schemas';
import { B2BPipelineService } from '../services/b2b-pipeline.service';

@Controller('b2b/opportunities')
export class OpportunitiesController {
  constructor(private readonly pipeline: B2BPipelineService) {}

  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'ADMIN')
  @Get()
  listOpportunities(
    @Query(new ZodValidationPipe(listOpportunitiesQuerySchema)) query: ListOpportunitiesQueryDto,
  ): Promise<Record<string, unknown>[]> {
    return this.pipeline.listOpportunities(query);
  }

  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'ADMIN')
  @Post()
  createOpportunity(
    @Body(new ZodValidationPipe(createOpportunitySchema)) body: CreateOpportunityDto,
  ): Promise<Record<string, unknown>> {
    return this.pipeline.createOpportunity(body);
  }

  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'ADMIN')
  @Patch(':id/stage')
  moveStage(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Body(new ZodValidationPipe(moveOpportunityStageSchema)) body: MoveOpportunityStageDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.pipeline.moveOpportunityStage(params.id, body, user);
  }
}
