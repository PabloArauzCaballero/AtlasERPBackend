import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../../../common/types/auth-context.types';
import {
  AddBusinessPartnerRoleDto,
  CreateBusinessPartnerDto,
  IdParamsDto,
  ListBusinessPartnersQueryDto,
  SetPartnerDefaultAccountDto,
  UpdateBusinessPartnerDto,
  addBusinessPartnerRoleSchema,
  createBusinessPartnerSchema,
  idParamsSchema,
  listBusinessPartnersQuerySchema,
  setPartnerDefaultAccountSchema,
  updateBusinessPartnerSchema,
} from '../../shared/schemas/accounting.schemas';
import { BusinessPartnersService } from '../services/business-partners.service';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

@Roles('admin', 'accountant', 'treasury', 'cfo')
@Controller('accounting/business-partners')
export class BusinessPartnersController {
  constructor(
    private readonly service: BusinessPartnersService,
    private readonly logger: PinoLoggerService,
  ) {}

  @Post()
  create(@Body(new ZodValidationPipe(createBusinessPartnerSchema)) body: CreateBusinessPartnerDto) {
    this.logger.info('Endpoint createBusinessPartner recibido.', {
      layer: 'controller',
      module: 'business-partners',
      action: 'create',
      partnerNo: body.partnerNo,
      partnerType: body.partnerType,
    });
    return this.service.create(body);
  }

  @Post('roles')
  addRole(
    @Body(new ZodValidationPipe(addBusinessPartnerRoleSchema)) body: AddBusinessPartnerRoleDto,
    @CurrentUser() user: AuthUser,
  ) {
    this.logger.info('Endpoint addBusinessPartnerRole recibido.', {
      layer: 'controller',
      module: 'business-partners',
      action: 'addRole',
      businessPartnerId: body.businessPartnerId,
      roleCode: body.roleCode,
      legalEntityId: body.legalEntityId,
      userId: user.sub,
    });
    return this.service.addRole(body, user);
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(listBusinessPartnersQuerySchema))
    query: ListBusinessPartnersQueryDto,
  ) {
    this.logger.debug('Endpoint listBusinessPartners recibido.', {
      layer: 'controller',
      module: 'business-partners',
      action: 'list',
      page: query.page,
      pageSize: query.pageSize,
      search: query.search ?? null,
      partnerType: query.partnerType ?? null,
    });
    return this.service.list(query);
  }

  @Get(':id')
  get(@Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto) {
    this.logger.debug('Endpoint getBusinessPartner recibido.', {
      layer: 'controller',
      module: 'business-partners',
      action: 'get',
      businessPartnerId: params.id,
    });
    return this.service.get(params.id);
  }

  @Patch(':id')
  update(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Body(new ZodValidationPipe(updateBusinessPartnerSchema)) body: UpdateBusinessPartnerDto,
  ) {
    this.logger.info('Endpoint updateBusinessPartner recibido.', {
      layer: 'controller',
      module: 'business-partners',
      action: 'update',
      businessPartnerId: params.id,
    });
    return this.service.update(params.id, body);
  }

  @Get(':id/default-accounts')
  listDefaultAccounts(@Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto) {
    return this.service.listDefaultAccounts(params.id);
  }

  @Put(':id/default-accounts')
  setDefaultAccount(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Body(new ZodValidationPipe(setPartnerDefaultAccountSchema)) body: SetPartnerDefaultAccountDto,
  ) {
    this.logger.info('Endpoint setPartnerDefaultAccount recibido.', {
      layer: 'controller',
      module: 'business-partners',
      action: 'setDefaultAccount',
      businessPartnerId: params.id,
      accountPurpose: body.accountPurpose,
    });
    return this.service.setDefaultAccount(params.id, body);
  }
}
