import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import {
  CreateChartOfAccountsDto,
  CreateGlAccountDto,
  CreateTaxCodeDto,
  IdParamsDto,
  ListGlAccountsQueryDto,
  UpdateGlAccountDto,
  createChartOfAccountsSchema,
  createGlAccountSchema,
  createTaxCodeSchema,
  idParamsSchema,
  listGlAccountsQuerySchema,
  updateGlAccountSchema,
} from '../../shared/schemas/accounting.schemas';
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

@Roles('admin', 'accountant', 'cfo')
@Controller('accounting/financial-structure')
export class FinancialStructureChartController {
  constructor(
    private readonly chart: ChartOfAccountsService,
    private readonly logger: PinoLoggerService,
  ) {}

  @Get('charts-of-accounts')
  listChartsOfAccounts() {
    return this.chart.listChartsOfAccounts();
  }

  @Get('tax-codes')
  listTaxCodes() {
    return this.chart.listTaxCodes();
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
    return this.chart.createChartOfAccounts(body);
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
    return this.chart.createGlAccount(body);
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
      hasSearch: Boolean(query.search),
      accountType: query.accountType ?? null,
    });
    return this.chart.listGlAccounts(query);
  }

  @Get('gl-accounts/:id')
  getGlAccount(@Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto) {
    this.logger.debug('Endpoint getGlAccount recibido.', {
      layer: 'controller',
      module: 'financial-structure',
      action: 'getGlAccount',
      glAccountId: params.id,
    });
    return this.chart.getGlAccount(params.id);
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
    return this.chart.updateGlAccount(params.id, body);
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
    return this.chart.createTaxCode(body);
  }
}
