import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../../common/types/auth-context.types';
import type {
  AccountIdParamsDto,
  BulkCreateAccountsDto,
  CreateAccountDto,
  CreateContactDto,
  IdParamsDto,
  ListAccountsQueryDto,
  QualifyAccountDto,
} from '../b2b-sales-crm.dtos';
import {
  accountIdParamsSchema,
  bulkCreateAccountsSchema,
  createAccountSchema,
  createContactSchema,
  idParamsSchema,
  listAccountsQuerySchema,
  qualifyAccountSchema,
} from '../b2b-sales-crm.schemas';
import { B2BSalesCrmService } from '../services/b2b-sales-crm.service';

@Controller('b2b/accounts')
export class B2BAccountsController {
  constructor(private readonly service: B2BSalesCrmService) {}

  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'ADMIN')
  @Post()
  createAccount(
    @Body(new ZodValidationPipe(createAccountSchema)) body: CreateAccountDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.service.createAccount(body, user);
  }

  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'FINANCE', 'LEGAL', 'OPERATIONS', 'ADMIN')
  @Get()
  listAccounts(
    @Query(new ZodValidationPipe(listAccountsQuerySchema)) query: ListAccountsQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.service.listAccounts(query);
  }

  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'FINANCE', 'LEGAL', 'OPERATIONS', 'ADMIN')
  @Get(':id')
  getAccount(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
  ): Promise<Record<string, unknown>> {
    return this.service.getAccount(params.id);
  }

  @Roles('COMMERCIAL_MANAGER', 'ADMIN')
  @Post('bulk')
  bulkCreateAccounts(
    @Body(new ZodValidationPipe(bulkCreateAccountsSchema)) body: BulkCreateAccountsDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.service.bulkCreateAccounts(body, user);
  }

  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'ADMIN')
  @Post(':accountId/contacts')
  createContact(
    @Param(new ZodValidationPipe(accountIdParamsSchema)) params: AccountIdParamsDto,
    @Body(new ZodValidationPipe(createContactSchema)) body: CreateContactDto,
  ): Promise<Record<string, unknown>> {
    return this.service.createContact(params.accountId, body);
  }

  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'ADMIN')
  @Post(':accountId/qualify')
  qualifyAccount(
    @Param(new ZodValidationPipe(accountIdParamsSchema)) params: AccountIdParamsDto,
    @Body(new ZodValidationPipe(qualifyAccountSchema)) body: QualifyAccountDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.service.qualifyAccount(params.accountId, body, user);
  }
}
