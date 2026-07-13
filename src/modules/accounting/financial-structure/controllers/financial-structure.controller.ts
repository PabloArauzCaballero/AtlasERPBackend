import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../../../common/types/auth-context.types';
import {
  CreateAccountingPeriodDto,
  CreateBranchDto,
  CreateChartOfAccountsDto,
  CreateFiscalYearDto,
  CreateGlAccountDto,
  CreateLedgerDto,
  CreateLegalEntityDto,
  CreateTaxCodeDto,
  IdParamsDto,
  ListGlAccountsQueryDto,
  UpdateGlAccountDto,
  createAccountingPeriodSchema,
  createBranchSchema,
  createChartOfAccountsSchema,
  createFiscalYearSchema,
  createGlAccountSchema,
  createLedgerSchema,
  createLegalEntitySchema,
  createTaxCodeSchema,
  idParamsSchema,
  listGlAccountsQuerySchema,
  updateGlAccountSchema,
} from '../../shared/schemas/accounting.schemas';
import { FinancialStructureService } from '../services/financial-structure.service';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

@Roles('admin', 'accountant', 'cfo')
@Controller('accounting/financial-structure')
export class FinancialStructureController {
  constructor(
    private readonly service: FinancialStructureService,
    private readonly logger: PinoLoggerService,
  ) {}

  // ---- Listados maestros (para poblar selects en el frontend) ----
  @Get('legal-entities')
  listLegalEntities() {
    return this.service.listLegalEntities();
  }

  @Get('branches')
  listBranches() {
    return this.service.listBranches();
  }

  @Get('fiscal-years')
  listFiscalYears() {
    return this.service.listFiscalYears();
  }

  @Get('periods')
  listAccountingPeriods() {
    return this.service.listAccountingPeriods();
  }

  @Get('ledgers')
  listLedgers() {
    return this.service.listLedgers();
  }

  @Get('charts-of-accounts')
  listChartsOfAccounts() {
    return this.service.listChartsOfAccounts();
  }

  @Get('tax-codes')
  listTaxCodes() {
    return this.service.listTaxCodes();
  }

  @Get('cost-centers')
  listCostCenters() {
    return this.service.listCostCenters();
  }

  @Get('profit-centers')
  listProfitCenters() {
    return this.service.listProfitCenters();
  }

  @Get('bank-accounts')
  listBankAccounts() {
    return this.service.listBankAccounts();
  }

  @Post('legal-entities')
  @Roles('admin')
  createLegalEntity(
    @Body(new ZodValidationPipe(createLegalEntitySchema)) body: CreateLegalEntityDto,
  ) {
    this.logger.info('Endpoint createLegalEntity recibido.', {
      layer: 'controller',
      module: 'financial-structure',
      action: 'createLegalEntity',
      code: body.code,
    });
    return this.service.createLegalEntity(body);
  }

  @Post('branches')
  createBranch(
    @Body(new ZodValidationPipe(createBranchSchema)) body: CreateBranchDto,
    @CurrentUser() user: AuthUser,
  ) {
    this.logger.info('Endpoint createBranch recibido.', {
      layer: 'controller',
      module: 'financial-structure',
      action: 'createBranch',
      code: body.code,
      legalEntityId: body.legalEntityId,
      userId: user.sub,
    });
    return this.service.createBranch(body, user);
  }

  @Post('fiscal-years')
  createFiscalYear(
    @Body(new ZodValidationPipe(createFiscalYearSchema)) body: CreateFiscalYearDto,
    @CurrentUser() user: AuthUser,
  ) {
    this.logger.info('Endpoint createFiscalYear recibido.', {
      layer: 'controller',
      module: 'financial-structure',
      action: 'createFiscalYear',
      yearLabel: body.yearLabel,
      legalEntityId: body.legalEntityId,
      userId: user.sub,
    });
    return this.service.createFiscalYear(body, user);
  }

  @Post('periods')
  createAccountingPeriod(
    @Body(new ZodValidationPipe(createAccountingPeriodSchema)) body: CreateAccountingPeriodDto,
    @CurrentUser() user: AuthUser,
  ) {
    this.logger.info('Endpoint createAccountingPeriod recibido.', {
      layer: 'controller',
      module: 'financial-structure',
      action: 'createAccountingPeriod',
      periodNo: body.periodNo,
      fiscalYearId: body.fiscalYearId,
      userId: user.sub,
    });
    return this.service.createAccountingPeriod(body, user);
  }

  @Post('ledgers')
  createLedger(
    @Body(new ZodValidationPipe(createLedgerSchema)) body: CreateLedgerDto,
    @CurrentUser() user: AuthUser,
  ) {
    this.logger.info('Endpoint createLedger recibido.', {
      layer: 'controller',
      module: 'financial-structure',
      action: 'createLedger',
      code: body.code,
      legalEntityId: body.legalEntityId,
      userId: user.sub,
    });
    return this.service.createLedger(body, user);
  }

  @Post('charts-of-accounts')
  createChartOfAccounts(
    @Body(new ZodValidationPipe(createChartOfAccountsSchema)) body: CreateChartOfAccountsDto,
  ) {
    this.logger.info('Endpoint createChartOfAccounts recibido.', {
      layer: 'controller',
      module: 'financial-structure',
      action: 'createChartOfAccounts',
      code: body.code,
      versionNo: body.versionNo,
    });
    return this.service.createChartOfAccounts(body);
  }

  @Post('gl-accounts')
  createGlAccount(@Body(new ZodValidationPipe(createGlAccountSchema)) body: CreateGlAccountDto) {
    this.logger.info('Endpoint createGlAccount recibido.', {
      layer: 'controller',
      module: 'financial-structure',
      action: 'createGlAccount',
      accountNo: body.accountNo,
      accountType: body.accountType,
    });
    return this.service.createGlAccount(body);
  }

  @Get('gl-accounts')
  listGlAccounts(
    @Query(new ZodValidationPipe(listGlAccountsQuerySchema)) query: ListGlAccountsQueryDto,
  ) {
    this.logger.debug('Endpoint listGlAccounts recibido.', {
      layer: 'controller',
      module: 'financial-structure',
      action: 'listGlAccounts',
      page: query.page,
      pageSize: query.pageSize,
      search: query.search ?? null,
      accountType: query.accountType ?? null,
    });
    return this.service.listGlAccounts(query);
  }

  @Get('gl-accounts/:id')
  getGlAccount(@Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto) {
    this.logger.debug('Endpoint getGlAccount recibido.', {
      layer: 'controller',
      module: 'financial-structure',
      action: 'getGlAccount',
      glAccountId: params.id,
    });
    return this.service.getGlAccount(params.id);
  }

  @Patch('gl-accounts/:id')
  updateGlAccount(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Body(new ZodValidationPipe(updateGlAccountSchema)) body: UpdateGlAccountDto,
  ) {
    this.logger.info('Endpoint updateGlAccount recibido.', {
      layer: 'controller',
      module: 'financial-structure',
      action: 'updateGlAccount',
      glAccountId: params.id,
    });
    return this.service.updateGlAccount(params.id, body);
  }

  @Post('tax-codes')
  createTaxCode(@Body(new ZodValidationPipe(createTaxCodeSchema)) body: CreateTaxCodeDto) {
    this.logger.info('Endpoint createTaxCode recibido.', {
      layer: 'controller',
      module: 'financial-structure',
      action: 'createTaxCode',
      code: body.code,
      taxType: body.taxType,
    });
    return this.service.createTaxCode(body);
  }
}
