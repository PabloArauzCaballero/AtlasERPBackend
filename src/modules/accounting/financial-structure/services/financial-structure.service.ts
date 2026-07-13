import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, Transaction, WhereOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  AccountingPeriodModel,
  BankAccountModel,
  BranchModel,
  ChartOfAccountsModel,
  CostCenterModel,
  FiscalYearModel,
  GlAccountModel,
  LedgerModel,
  LegalEntityModel,
  ProfitCenterModel,
  TaxCodeModel,
} from '../../../../database/models';
import { AuthUser } from '../../../../common/types/auth-context.types';
import { LegalEntityAccessService } from '../../../../common/services/legal-entity-access.service';
import {
  CreateAccountingPeriodDto,
  CreateBranchDto,
  CreateChartOfAccountsDto,
  CreateFiscalYearDto,
  CreateGlAccountDto,
  CreateLedgerDto,
  CreateLegalEntityDto,
  CreateTaxCodeDto,
  ListGlAccountsQueryDto,
  UpdateGlAccountDto,
} from '../../shared/schemas/accounting.schemas';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

/**
 * Mantiene la estructura financiera base: entidad legal, calendario fiscal, ledger y plan de cuentas.
 */
@Injectable()
export class FinancialStructureService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly legalEntityAccessService: LegalEntityAccessService,
    private readonly logger: PinoLoggerService,
    @InjectModel(LegalEntityModel) private readonly legalEntityModel: typeof LegalEntityModel,
    @InjectModel(BranchModel) private readonly branchModel: typeof BranchModel,
    @InjectModel(FiscalYearModel) private readonly fiscalYearModel: typeof FiscalYearModel,
    @InjectModel(AccountingPeriodModel)
    private readonly accountingPeriodModel: typeof AccountingPeriodModel,
    @InjectModel(LedgerModel) private readonly ledgerModel: typeof LedgerModel,
    @InjectModel(ChartOfAccountsModel)
    private readonly chartOfAccountsModel: typeof ChartOfAccountsModel,
    @InjectModel(GlAccountModel) private readonly glAccountModel: typeof GlAccountModel,
    @InjectModel(TaxCodeModel) private readonly taxCodeModel: typeof TaxCodeModel,
    @InjectModel(CostCenterModel) private readonly costCenterModel: typeof CostCenterModel,
    @InjectModel(ProfitCenterModel) private readonly profitCenterModel: typeof ProfitCenterModel,
    @InjectModel(BankAccountModel) private readonly bankAccountModel: typeof BankAccountModel,
  ) {}

  createLegalEntity(input: CreateLegalEntityDto) {
    this.logger.info('Creando entidad legal.', {
      layer: 'service',
      module: 'financial-structure',
      action: 'createLegalEntity',
      code: input.code,
    });
    return this.legalEntityModel.create(input);
  }

  createBranch(input: CreateBranchDto, user: AuthUser) {
    this.logger.info('Creando sucursal.', {
      layer: 'service',
      module: 'financial-structure',
      action: 'createBranch',
      code: input.code,
      legalEntityId: input.legalEntityId,
      userId: user.sub,
    });
    this.legalEntityAccessService.assertCanAccessLegalEntity(user, input.legalEntityId);
    return this.branchModel.create(input);
  }

  createFiscalYear(input: CreateFiscalYearDto, user: AuthUser) {
    this.logger.info('Creando año fiscal.', {
      layer: 'service',
      module: 'financial-structure',
      action: 'createFiscalYear',
      yearLabel: input.yearLabel,
      legalEntityId: input.legalEntityId,
      userId: user.sub,
    });
    return this.sequelize.transaction(async (transaction) => {
      this.legalEntityAccessService.assertCanAccessLegalEntity(user, input.legalEntityId);
      this.assertDateRangeIsValid(input.startDate, input.endDate, 'INVALID_FISCAL_YEAR_DATE_RANGE');
      return this.fiscalYearModel.create(input, { transaction });
    });
  }

  createAccountingPeriod(input: CreateAccountingPeriodDto, user: AuthUser) {
    this.logger.info('Creando período contable.', {
      layer: 'service',
      module: 'financial-structure',
      action: 'createAccountingPeriod',
      fiscalYearId: input.fiscalYearId,
      periodNo: input.periodNo,
      userId: user.sub,
    });
    return this.sequelize.transaction(async (transaction) => {
      this.assertDateRangeIsValid(input.startDate, input.endDate, 'INVALID_PERIOD_DATE_RANGE');
      const fiscalYear = await this.assertPeriodIsInsideFiscalYear(input, transaction);
      this.legalEntityAccessService.assertCanAccessLegalEntity(user, fiscalYear.legalEntityId);
      await this.assertPeriodDoesNotOverlap(input, transaction);
      return this.accountingPeriodModel.create(input, { transaction });
    });
  }

  createLedger(input: CreateLedgerDto, user: AuthUser) {
    this.logger.info('Creando ledger contable.', {
      layer: 'service',
      module: 'financial-structure',
      action: 'createLedger',
      code: input.code,
      accountingBasis: input.accountingBasis,
      legalEntityId: input.legalEntityId,
      userId: user.sub,
    });
    return this.sequelize.transaction(async (transaction) => {
      this.legalEntityAccessService.assertCanAccessLegalEntity(user, input.legalEntityId);
      if (input.isDefault) {
        const existingDefaultLedger = await this.ledgerModel.findOne({
          where: {
            legalEntityId: input.legalEntityId,
            accountingBasis: input.accountingBasis,
            isDefault: true,
          },
          transaction,
        });

        if (existingDefaultLedger) {
          throw new ConflictException({
            code: 'DEFAULT_LEDGER_ALREADY_EXISTS',
            message: 'Ya existe un ledger por defecto para esa entidad legal y base contable.',
          });
        }
      }

      return this.ledgerModel.create(input, { transaction });
    });
  }

  createChartOfAccounts(input: CreateChartOfAccountsDto) {
    this.logger.info('Creando plan de cuentas.', {
      layer: 'service',
      module: 'financial-structure',
      action: 'createChartOfAccounts',
      code: input.code,
      versionNo: input.versionNo,
    });
    if (input.effectiveTo) {
      this.assertDateRangeIsValid(input.effectiveFrom, input.effectiveTo, 'INVALID_COA_DATE_RANGE');
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
    this.assertGlAccountBalanceConvention(input);
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
      this.assertDateRangeIsValid(
        input.effectiveFrom,
        input.effectiveTo,
        'INVALID_TAX_CODE_DATE_RANGE',
      );
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

  // ---- Listados maestros (para poblar selects en el frontend) ----
  listLegalEntities() {
    return this.legalEntityModel.findAll({ order: [['code', 'ASC']] });
  }
  listBranches() {
    return this.branchModel.findAll({ order: [['code', 'ASC']] });
  }
  listFiscalYears() {
    return this.fiscalYearModel.findAll({ order: [['yearLabel', 'DESC']] });
  }
  listAccountingPeriods() {
    return this.accountingPeriodModel.findAll({ order: [['startDate', 'DESC']] });
  }
  listLedgers() {
    return this.ledgerModel.findAll({ order: [['code', 'ASC']] });
  }
  listChartsOfAccounts() {
    return this.chartOfAccountsModel.findAll({ order: [['code', 'ASC']] });
  }
  listTaxCodes() {
    return this.taxCodeModel.findAll({ order: [['code', 'ASC']] });
  }
  listCostCenters() {
    return this.costCenterModel.findAll({ order: [['code', 'ASC']] });
  }
  listProfitCenters() {
    return this.profitCenterModel.findAll({ order: [['code', 'ASC']] });
  }
  listBankAccounts() {
    return this.bankAccountModel.findAll({ order: [['accountName', 'ASC']] });
  }

  private async assertPeriodIsInsideFiscalYear(
    input: CreateAccountingPeriodDto,
    transaction: Transaction,
  ): Promise<FiscalYearModel> {
    const fiscalYear = await this.fiscalYearModel.findByPk(input.fiscalYearId, { transaction });
    if (!fiscalYear) {
      throw new BadRequestException({
        code: 'FISCAL_YEAR_NOT_FOUND',
        message: 'El año fiscal informado no existe.',
      });
    }

    if (
      this.toDateOnly(input.startDate) < this.toDateOnly(fiscalYear.startDate) ||
      this.toDateOnly(input.endDate) > this.toDateOnly(fiscalYear.endDate)
    ) {
      throw new BadRequestException({
        code: 'PERIOD_OUTSIDE_FISCAL_YEAR',
        message: 'El período contable debe estar dentro del rango del año fiscal.',
      });
    }

    return fiscalYear;
  }

  private async assertPeriodDoesNotOverlap(
    input: CreateAccountingPeriodDto,
    transaction: Transaction,
  ): Promise<void> {
    const overlappingPeriod = await this.accountingPeriodModel.findOne({
      where: {
        fiscalYearId: input.fiscalYearId,
        [Op.and]: [
          { startDate: { [Op.lte]: this.toDateOnly(input.endDate) } },
          { endDate: { [Op.gte]: this.toDateOnly(input.startDate) } },
        ],
      },
      transaction,
    });

    if (overlappingPeriod) {
      throw new ConflictException({
        code: 'ACCOUNTING_PERIOD_OVERLAP',
        message: 'El período contable se solapa con otro período del mismo año fiscal.',
      });
    }
  }

  private assertGlAccountBalanceConvention(input: CreateGlAccountDto): void {
    const expectedDebitTypes = new Set(['ASSET', 'EXPENSE']);
    const expectedCreditTypes = new Set(['LIABILITY', 'EQUITY', 'REVENUE', 'CONTRA_ASSET']);

    if (expectedDebitTypes.has(input.accountType) && input.normalBalance !== 'D') {
      throw new BadRequestException({
        code: 'INVALID_GL_NORMAL_BALANCE',
        message: 'Las cuentas de activo y gasto deben tener naturaleza deudora.',
      });
    }

    if (expectedCreditTypes.has(input.accountType) && input.normalBalance !== 'C') {
      throw new BadRequestException({
        code: 'INVALID_GL_NORMAL_BALANCE',
        message:
          'Las cuentas de pasivo, patrimonio, ingreso y contra-activo deben tener naturaleza acreedora.',
      });
    }
  }

  private assertDateRangeIsValid(startDate: Date, endDate: Date, code: string): void {
    if (endDate < startDate) {
      throw new BadRequestException({
        code,
        message: 'La fecha final no puede ser anterior a la fecha inicial.',
      });
    }
  }

  private toDateOnly(value: Date | string): string {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return value.slice(0, 10);
  }
}
