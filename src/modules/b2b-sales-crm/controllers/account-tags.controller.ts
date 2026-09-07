import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { CreateAccountTagDto, IdParamsDto, UpdateAccountTagDto } from '../b2b-sales-crm.dtos';
import {
  createAccountTagSchema,
  idParamsSchema,
  updateAccountTagSchema,
} from '../b2b-sales-crm.schemas';
import { AccountTagsService, type AccountTagView } from '../services/account-tags.service';
import { AccountTagModel } from '../models/b2b-sales-crm.models';

/** Administración del catálogo de tags de clasificación de cuentas B2B. */
@Controller('b2b/tags')
export class AccountTagsController {
  constructor(private readonly service: AccountTagsService) {}

  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'FINANCE', 'OPERATIONS', 'ADMIN')
  @Get()
  list(): Promise<AccountTagView[]> {
    return this.service.list();
  }

  @Roles('COMMERCIAL_MANAGER', 'ADMIN')
  @Post()
  create(
    @Body(new ZodValidationPipe(createAccountTagSchema)) body: CreateAccountTagDto,
  ): Promise<AccountTagModel> {
    return this.service.create(body);
  }

  @Roles('COMMERCIAL_MANAGER', 'ADMIN')
  @Patch(':id')
  update(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Body(new ZodValidationPipe(updateAccountTagSchema)) body: UpdateAccountTagDto,
  ): Promise<AccountTagModel> {
    return this.service.update(params.id, body);
  }

  @Roles('COMMERCIAL_MANAGER', 'ADMIN')
  @Delete(':id')
  remove(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Query('force') force?: string,
  ): Promise<{ id: string; name: string; unlinkedAccounts: number }> {
    return this.service.remove(params.id, force === 'true');
  }
}
