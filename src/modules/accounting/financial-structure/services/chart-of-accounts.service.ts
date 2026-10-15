import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, WhereOptions } from 'sequelize';
import { ChartOfAccountsModel, GlAccountModel, TaxCodeModel } from '../../../../database/models';
import {
  CreateChartOfAccountsDto,
  CreateGlAccountDto,
  CreateTaxCodeDto,
  ListGlAccountsQueryDto,
  UpdateGlAccountDto,
} from '../../shared/schemas/accounting.schemas';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';
import {
  assertDateRangeIsValid,
  assertGlAccountBalanceConvention,
} from '../domain/financial-structure-rules';

/** Plan de cuentas, cuentas GL y códigos tributarios: catálogos globales, sin filtro por entidad. */
@Injectable()
export class ChartOfAccountsService {
  constructor(
    private readonly logger: PinoLoggerService,
    @InjectModel(ChartOfAccountsModel)
    private readonly chartOfAccountsModel: typeof ChartOfAccountsModel,
    @InjectModel(GlAccountModel) private readonly glAccountModel: typeof GlAccountModel,
    @InjectModel(TaxCodeModel) private readonly taxCodeModel: typeof TaxCodeModel,
  ) {}

  createChartOfAccounts(input: CreateChartOfAccountsDto) {
    this.logger.info('Creando plan de cuentas.', {
      layer: 'service',
      module: 'financial-structure',
      action: 'createChartOfAccounts',
      code: input.code,
      versionNo: input.versionNo,
    });
    if (input.effectiveTo) {
      assertDateRangeIsValid(input.effectiveFrom, input.effectiveTo, 'INVALID_COA_DATE_RANGE');
    }

    return this.chartOfAccountsModel.create(input);
  }

  createGlAccount(input: CreateGlAccountDto) {
    this.logger.info('Creando cuenta GL.', {
      layer: 'service',
      module: 'financial-structure',
      action: 'createGlAccount',
      accountNo: input.accountNo,
      accountType: input.accountType,
    });
    assertGlAccountBalanceConvention(input);
    return this.glAccountModel.create(input);
  }

  createTaxCode(input: CreateTaxCodeDto) {
    this.logger.info('Creando código de impuesto.', {
      layer: 'service',
      module: 'financial-structure',
      action: 'createTaxCode',
      code: input.code,
      taxType: input.taxType,
    });
    if (input.effectiveTo) {
      assertDateRangeIsValid(input.effectiveFrom, input.effectiveTo, 'INVALID_TAX_CODE_DATE_RANGE');
    }

    return this.taxCodeModel.create(input);
  }

  listGlAccounts(query: ListGlAccountsQueryDto) {
    this.logger.debug('Listando cuentas GL.', {
      layer: 'service',
      module: 'financial-structure',
      action: 'listGlAccounts',
      page: query.page,
      pageSize: query.pageSize,
    });
    const where: Record<string | symbol, unknown> = {};
    if (query.accountType) where.accountType = query.accountType;
    if (query.status) where.status = query.status;
    if (query.search) {
      where[Op.or] = [
        { accountNo: { [Op.iLike]: `%${query.search}%` } },
        { name: { [Op.iLike]: `%${query.search}%` } },
      ];
    }
    return this.glAccountModel.findAndCountAll({
      where: where as WhereOptions,
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
      order: [['accountNo', 'ASC']],
    });
  }

  async getGlAccount(id: string): Promise<GlAccountModel> {
    const account = await this.glAccountModel.findByPk(id);
    if (!account) {
      throw new NotFoundException({
        code: 'GL_ACCOUNT_NOT_FOUND',
        message: 'La cuenta GL informada no existe.',
      });
    }
    return account;
  }

  async updateGlAccount(id: string, input: UpdateGlAccountDto): Promise<GlAccountModel> {
    this.logger.info('Actualizando cuenta GL.', {
      layer: 'service',
      module: 'financial-structure',
      action: 'updateGlAccount',
      glAccountId: id,
    });
    const account = await this.getGlAccount(id);
    await account.update(input);
    return account;
  }

  listChartsOfAccounts() {
    return this.chartOfAccountsModel.findAll({ order: [['code', 'ASC']] });
  }

  listTaxCodes() {
    return this.taxCodeModel.findAll({ order: [['code', 'ASC']] });
  }
}
