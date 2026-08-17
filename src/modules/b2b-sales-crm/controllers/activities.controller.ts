import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type {
  CreateActivityDto,
  IdParamsDto,
  ListActivitiesQueryDto,
  UpdateActivityDto,
} from '../b2b-sales-crm.dtos';
import {
  createActivitySchema,
  idParamsSchema,
  listActivitiesQuerySchema,
  updateActivitySchema,
} from '../b2b-sales-crm.schemas';
import { ActivitiesService } from '../services/activities.service';

@Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'ADMIN')
@Controller('b2b/activities')
export class ActivitiesController {
  constructor(private readonly service: ActivitiesService) {}

  @Post()
  create(@Body(new ZodValidationPipe(createActivitySchema)) body: CreateActivityDto) {
    return this.service.create(body);
  }

  @Get()
  list(@Query(new ZodValidationPipe(listActivitiesQuerySchema)) query: ListActivitiesQueryDto) {
    return this.service.list(query);
  }

  @Patch(':id/complete')
  complete(@Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto) {
    return this.service.complete(params.id);
  }

  @Patch(':id')
  update(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Body(new ZodValidationPipe(updateActivitySchema)) body: UpdateActivityDto,
  ) {
    return this.service.update(params.id, body);
  }

  @Delete(':id')
  remove(@Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto) {
    return this.service.remove(params.id);
  }
}
