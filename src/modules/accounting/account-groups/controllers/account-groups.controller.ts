import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import {
  CreateEntityLinkDto,
  CreateGlAccountGroupDto,
  IdParamsDto,
  ListGlAccountGroupsQueryDto,
  UpdateGlAccountGroupDto,
  createEntityLinkSchema,
  createGlAccountGroupSchema,
  idParamsSchema,
  listGlAccountGroupsQuerySchema,
  updateGlAccountGroupSchema,
} from '../../shared/schemas/accounting.schemas';
import { AccountGroupsService } from '../services/account-groups.service';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

@Roles('admin', 'accountant', 'cfo')
@Controller('accounting')
export class AccountGroupsController {
  constructor(
    private readonly service: AccountGroupsService,
    private readonly logger: PinoLoggerService,
  ) {}

  @Post('account-groups')
  createGroup(
    @Body(new ZodValidationPipe(createGlAccountGroupSchema)) body: CreateGlAccountGroupDto,
  ) {
    this.logger.info('Endpoint createAccountGroup recibido.', {
      layer: 'controller',
      module: 'account-groups',
      action: 'createGroup',
      coaId: body.coaId,
      code: body.code,
    });
    return this.service.createGroup(body);
  }

  @Get('account-groups')
  listGroups(
    @Query(new ZodValidationPipe(listGlAccountGroupsQuerySchema))
    query: ListGlAccountGroupsQueryDto,
  ) {
    return this.service.listGroups(query);
  }

  @Get('account-groups/tree')
  tree(@Query('coaId') coaId?: string) {
    return this.service.tree(coaId);
  }

  @Get('account-groups/:id')
  getGroup(@Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto) {
    return this.service.getGroup(params.id);
  }

  @Patch('account-groups/:id')
  updateGroup(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Body(new ZodValidationPipe(updateGlAccountGroupSchema)) body: UpdateGlAccountGroupDto,
  ) {
    return this.service.updateGroup(params.id, body);
  }

  // ---- Vínculos multientidad de cuentas GL ----

  @Post('gl-accounts/:id/links')
  createAccountLink(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Body(new ZodValidationPipe(createEntityLinkSchema)) body: CreateEntityLinkDto,
  ) {
    return this.service.createAccountLink(params.id, body);
  }

  @Get('gl-accounts/:id/links')
  listAccountLinks(@Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto) {
    return this.service.listAccountLinks(params.id);
  }

  @Delete('gl-account-links/:id')
  deleteAccountLink(@Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto) {
    return this.service.deleteAccountLink(params.id);
  }

  // ---- Vínculos multientidad de asientos ----

  @Post('journal-entries/:id/links')
  createJournalLink(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Body(new ZodValidationPipe(createEntityLinkSchema)) body: CreateEntityLinkDto,
  ) {
    return this.service.createJournalLink(params.id, body);
  }

  @Get('journal-entries/:id/links')
  listJournalLinks(@Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto) {
    return this.service.listJournalLinks(params.id);
  }
}
