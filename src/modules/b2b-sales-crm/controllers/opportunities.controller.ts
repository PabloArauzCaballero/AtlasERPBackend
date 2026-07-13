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
import { B2BSalesCrmService } from '../services/b2b-sales-crm.service';

@Controller('b2b/opportunities')
export class OpportunitiesController {
  constructor(private readonly service: B2BSalesCrmService) {}

  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'ADMIN')
  @Get()
  listOpportunities(
    @Query(new ZodValidationPipe(listOpportunitiesQuerySchema)) query: ListOpportunitiesQueryDto,
  ): Promise<Record<string, unknown>[]> {
    return this.service.listOpportunities(query);
  }

  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'ADMIN')
  @Post()
  createOpportunity(
    @Body(new ZodValidationPipe(createOpportunitySchema)) body: CreateOpportunityDto,
  ): Promise<Record<string, unknown>> {
    return this.service.createOpportunity(body);
  }

  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'ADMIN')
  @Patch(':id/stage')
  moveStage(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Body(new ZodValidationPipe(moveOpportunityStageSchema)) body: MoveOpportunityStageDto,
  ): Promise<Record<string, unknown>> {
    return this.service.moveOpportunityStage(params.id, body);
  }
}
