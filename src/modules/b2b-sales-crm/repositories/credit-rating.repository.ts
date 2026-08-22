import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Op, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { B2BAccountModel, MerchantReceivableModel } from '../models/b2b-sales-crm.models';
import {
  B2BAccountRiskRatingModel,
  RatingPolicyBandModel,
  RatingPolicyVersionModel,
  ReceivableRiskRatingModel,
} from '../models/credit-rating.models';

/** Estados que ya no representan exposición: una factura pagada o anulada no se califica. */
export const CLOSED_RECEIVABLE_STATUSES = ['PAID', 'CANCELLED'];

@Injectable()
export class CreditRatingRepository {
  constructor(
    @InjectConnection() readonly sequelize: Sequelize,
    @InjectModel(RatingPolicyVersionModel) readonly policies: typeof RatingPolicyVersionModel,
    @InjectModel(RatingPolicyBandModel) readonly bands: typeof RatingPolicyBandModel,
    @InjectModel(ReceivableRiskRatingModel)
    readonly receivableRatings: typeof ReceivableRiskRatingModel,
    @InjectModel(B2BAccountRiskRatingModel)
    readonly accountRatings: typeof B2BAccountRiskRatingModel,
    @InjectModel(MerchantReceivableModel) readonly receivables: typeof MerchantReceivableModel,
    @InjectModel(B2BAccountModel) readonly accounts: typeof B2BAccountModel,
  ) {}

  findActivePolicy(transaction?: Transaction): Promise<RatingPolicyVersionModel | null> {
    return this.policies.findOne({ where: { status: 'ACTIVE' }, transaction });
  }

  findBands(policyVersionId: string, transaction?: Transaction): Promise<RatingPolicyBandModel[]> {
    return this.bands.findAll({
      where: { policyVersionId },
      order: [['severity_rank', 'ASC']],
      transaction,
    });
  }

  /** Los vencimientos con saldo abierto de una cuenta. Es la población del arrastre. */
  findOpenReceivables(
    accountId: string,
    transaction?: Transaction,
  ): Promise<MerchantReceivableModel[]> {
    return this.receivables.findAll({
      where: { accountId, status: { [Op.notIn]: CLOSED_RECEIVABLE_STATUSES } },
      order: [['due_date', 'ASC']],
      transaction,
    });
  }

  /** Cuentas con deuda abierta: el lote del barrido, en orden estable para poder paginar. */
  async findAccountIdsWithOpenDebt(limit: number): Promise<string[]> {
    const rows = await this.receivables.findAll({
      attributes: ['accountId'],
      where: { status: { [Op.notIn]: CLOSED_RECEIVABLE_STATUSES } },
      group: ['account_id'],
      order: [['account_id', 'ASC']],
      limit,
      raw: true,
    });
    return (rows as unknown as { accountId: string }[]).map((row) => row.accountId);
  }

  findCurrentReceivableRating(
    receivableId: string,
    transaction?: Transaction,
  ): Promise<ReceivableRiskRatingModel | null> {
    return this.receivableRatings.findOne({
      where: { receivableId, isCurrent: true },
      transaction,
    });
  }

  findCurrentAccountRating(
    accountId: string,
    transaction?: Transaction,
  ): Promise<B2BAccountRiskRatingModel | null> {
    return this.accountRatings.findOne({ where: { accountId, isCurrent: true }, transaction });
  }

  findAccountRatingHistory(accountId: string, limit: number): Promise<B2BAccountRiskRatingModel[]> {
    return this.accountRatings.findAll({
      where: { accountId },
      order: [['rated_at', 'DESC']],
      limit,
    });
  }

  findReceivableRatingsByAccount(accountId: string): Promise<ReceivableRiskRatingModel[]> {
    return this.receivableRatings.findAll({
      where: { accountId, isCurrent: true },
      order: [['severity_rank', 'DESC']],
    });
  }

  /**
   * Sustituye la calificación vigente por una nueva.
   *
   * Baja `is_current` ANTES de insertar y dentro de la misma transacción, porque el índice único
   * parcial sobre las vigentes rechazaría la segunda. Ese rechazo es deliberado: es lo que impide
   * que una carrera entre el barrido y una recalificación manual deje dos calificaciones vigentes
   * del mismo documento y ninguna forma de saber cuál rige.
   */
  async supersedeReceivableRating(
    receivableId: string,
    values: Record<string, unknown>,
    transaction: Transaction,
  ): Promise<ReceivableRiskRatingModel> {
    await this.receivableRatings.update(
      { isCurrent: false },
      { where: { receivableId, isCurrent: true }, transaction },
    );
    return this.receivableRatings.create(values, { transaction });
  }

  async supersedeAccountRating(
    accountId: string,
    values: Record<string, unknown>,
    transaction: Transaction,
  ): Promise<B2BAccountRiskRatingModel> {
    await this.accountRatings.update(
      { isCurrent: false },
      { where: { accountId, isCurrent: true }, transaction },
    );
    return this.accountRatings.create(values, { transaction });
  }

  /**
   * Proyecta la categoría sobre la cuenta.
   *
   * `risk_rating_grade` es una PROYECCIÓN para que listar el CRM no exija un join por fila; la fuente
   * de verdad sigue siendo `b2b_account_risk_ratings`. No toca `risk_tier`: ese es el juicio
   * comercial que carga un ejecutivo al alta, y pisarlo haría que nadie pudiera decir cuál de los dos
   * está viendo.
   */
  async projectGradeOnAccount(
    accountId: string,
    grade: string,
    ratedAt: Date,
    transaction: Transaction,
  ): Promise<void> {
    await this.accounts.update(
      { riskRatingGrade: grade, riskRatingUpdatedAt: ratedAt, updatedAt: ratedAt },
      { where: { id: accountId }, transaction },
    );
  }

  async summarizePortfolio(): Promise<PortfolioGradeRow[]> {
    const rows = await this.receivableRatings.findAll({
      attributes: [
        'grade',
        'gradeLabel',
        'severityRank',
        [this.sequelize.fn('COUNT', this.sequelize.col('id')), 'receivableCount'],
        [this.sequelize.fn('SUM', this.sequelize.col('exposure_amount')), 'exposureAmount'],
        [this.sequelize.fn('SUM', this.sequelize.col('provision_amount')), 'provisionAmount'],
      ],
      where: { isCurrent: true },
      group: ['grade', 'grade_label', 'severity_rank'],
      order: [['severity_rank', 'ASC']],
      raw: true,
    });
    return rows as unknown as PortfolioGradeRow[];
  }
}

export interface PortfolioGradeRow {
  grade: string;
  gradeLabel: string;
  severityRank: number;
  receivableCount: string;
  exposureAmount: string | null;
  provisionAmount: string | null;
}
