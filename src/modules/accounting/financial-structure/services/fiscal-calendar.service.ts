import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, Transaction, WhereOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { AccountingPeriodModel, FiscalYearModel } from '../../../../database/models';
import { AuthUser } from '../../../../common/types/auth-context.types';
import { LegalEntityAccessService } from '../../../../common/services/legal-entity-access.service';
import {
  CreateAccountingPeriodDto,
  CreateFiscalYearDto,
} from '../../shared/schemas/accounting.schemas';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';
import { fiscalYearLabel } from '../fiscal-year-label';
import {
  assertDateRangeIsValid,
  assertPeriodInsideFiscalYear,
  legalEntityScope,
  nextPeriodNumber,
  toDateOnly,
} from '../domain/financial-structure-rules';

/** Calendario fiscal: años y períodos contables de una entidad legal. */
@Injectable()
export class FiscalCalendarService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly legalEntityAccessService: LegalEntityAccessService,
    private readonly logger: PinoLoggerService,
    @InjectModel(FiscalYearModel) private readonly fiscalYearModel: typeof FiscalYearModel,
    @InjectModel(AccountingPeriodModel)
    private readonly accountingPeriodModel: typeof AccountingPeriodModel,
  ) {}

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
      assertDateRangeIsValid(input.startDate, input.endDate, 'INVALID_FISCAL_YEAR_DATE_RANGE');
      return this.fiscalYearModel.create(
        { ...input, yearLabel: input.yearLabel ?? fiscalYearLabel(input.startDate, input.endDate) },
        { transaction },
      );
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
      assertDateRangeIsValid(input.startDate, input.endDate, 'INVALID_PERIOD_DATE_RANGE');
      const fiscalYear = await this.findFiscalYear(input.fiscalYearId, transaction);
      assertPeriodInsideFiscalYear(input, fiscalYear);
      this.legalEntityAccessService.assertCanAccessLegalEntity(user, fiscalYear.legalEntityId);
      await this.assertPeriodDoesNotOverlap(input, transaction);
      const periodNo = input.periodNo ?? (await this.nextPeriodNo(input.fiscalYearId, transaction));
      return this.accountingPeriodModel.create({ ...input, periodNo }, { transaction });
    });
  }

  listFiscalYears(user: AuthUser) {
    return this.fiscalYearModel.findAll({
      where: this.scopeOf(user),
      order: [['yearLabel', 'DESC']],
    });
  }

  async listAccountingPeriods(user: AuthUser) {
    const allowed = this.legalEntityAccessService.accessibleLegalEntityIds(user);
    if (allowed === null) {
      return this.accountingPeriodModel.findAll({ order: [['startDate', 'DESC']] });
    }
    const years = await this.fiscalYearModel.findAll({
      attributes: ['id'],
      where: this.scopeOf(user),
    });
    return this.accountingPeriodModel.findAll({
      where: { fiscalYearId: { [Op.in]: years.map((year) => year.id) } } as WhereOptions,
      order: [['startDate', 'DESC']],
    });
  }

  private scopeOf(user: AuthUser): WhereOptions {
    return legalEntityScope(this.legalEntityAccessService.accessibleLegalEntityIds(user));
  }

  private async findFiscalYear(id: string, transaction: Transaction): Promise<FiscalYearModel> {
    const fiscalYear = await this.fiscalYearModel.findByPk(id, { transaction });
    if (!fiscalYear) {
      throw new BadRequestException({
        code: 'FISCAL_YEAR_NOT_FOUND',
        message: 'El año fiscal informado no existe.',
      });
    }
    return fiscalYear;
  }

  private async nextPeriodNo(fiscalYearId: string, transaction: Transaction): Promise<number> {
    const current = (await this.accountingPeriodModel.max('periodNo', {
      where: { fiscalYearId },
      transaction,
    })) as number | null;
    return nextPeriodNumber(current);
  }

  private async assertPeriodDoesNotOverlap(
    input: CreateAccountingPeriodDto,
    transaction: Transaction,
  ): Promise<void> {
    const overlappingPeriod = await this.accountingPeriodModel.findOne({
      where: {
        fiscalYearId: input.fiscalYearId,
        [Op.and]: [
          { startDate: { [Op.lte]: toDateOnly(input.endDate) } },
          { endDate: { [Op.gte]: toDateOnly(input.startDate) } },
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
}
