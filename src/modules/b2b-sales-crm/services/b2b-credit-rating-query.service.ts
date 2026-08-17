import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { fromCents, sumCents, toCents } from '../domain/money.util';
import type {
  B2BAccountRiskRatingModel,
  ReceivableRiskRatingModel,
} from '../models/credit-rating.models';
import {
  CreditRatingRepository,
  type PortfolioGradeRow,
} from '../repositories/credit-rating.repository';

@Injectable()
export class B2BCreditRatingQueryService {
  constructor(private readonly repository: CreditRatingRepository) {}

  /**
   * Calificación vigente de un cliente, con el detalle de las deudas que la produjeron.
   *
   * Una cuenta sin calificar da 404 y no una categoría por defecto: «todavía no se calificó» y «se
   * calificó y salió A» son estados distintos, y devolver A para el primero haría que una cuenta que
   * el barrido nunca alcanzó se lea como sana en el reporte de cierre.
   */
  async getAccountRating(accountId: string): Promise<Record<string, unknown>> {
    const rating = await this.repository.findCurrentAccountRating(accountId);
    if (!rating) {
      throw new NotFoundException('La cuenta B2B no tiene calificación vigente.');
    }
    const receivables = await this.repository.findReceivableRatingsByAccount(accountId);
    return {
      ...toAccountRatingResponse(rating),
      receivables: receivables.map(toReceivableRatingResponse),
    };
  }

  async getAccountRatingHistory(
    accountId: string,
    limit: number,
  ): Promise<Record<string, unknown>> {
    const rows = await this.repository.findAccountRatingHistory(accountId, limit);
    return { accountId, items: rows.map(toAccountRatingResponse) };
  }

  /**
   * Distribución de la cartera por categoría, con la política que la produjo.
   *
   * La política viaja en la respuesta porque una distribución sin la matriz que la generó no se puede
   * comparar contra la del mes pasado: si entre medias cambió un umbral, la migración de categorías
   * que se ve no es deterioro de la cartera sino un cambio de regla.
   */
  async getPortfolioSummary(): Promise<Record<string, unknown>> {
    const policy = await this.repository.findActivePolicy();
    if (!policy) {
      throw new UnprocessableEntityException('RATING_POLICY_NOT_ACTIVE');
    }
    const grades = (await this.repository.summarizePortfolio()).map(toPortfolioGradeResponse);

    return {
      policy: {
        id: policy.id,
        policyCode: policy.policyCode,
        versionCode: policy.versionCode,
        scaleCode: policy.scaleCode,
        contaminationEnabled: policy.contaminationEnabled,
      },
      grades,
      totals: {
        receivableCount: grades.reduce((total, row) => total + row.receivableCount, 0),
        exposureAmount: sumDecimals(grades.map((row) => row.exposureAmount)),
        provisionAmount: sumDecimals(grades.map((row) => row.provisionAmount)),
      },
    };
  }
}

/**
 * Los importes salen como TEXTO, igual que entran.
 *
 * Convertirlos a `number` para la respuesta reintroduce en el borde de salida el error de precisión
 * que el módulo evita por dentro: un saldo serializado como flotante puede llegar al consumidor con
 * un céntimo distinto al que hay en la base, y ese consumidor lo cuadra contra contabilidad.
 */
export function toReceivableRatingResponse(
  rating: ReceivableRiskRatingModel,
): Record<string, unknown> {
  return {
    id: rating.id,
    receivableId: rating.receivableId,
    accountId: rating.accountId,
    policyVersionId: rating.policyVersionId,
    grade: rating.grade,
    gradeLabel: rating.gradeLabel,
    severityRank: rating.severityRank,
    daysPastDue: rating.daysPastDue,
    receivableStatus: rating.receivableStatus,
    exposureAmount: rating.exposureAmount,
    provisionRate: rating.provisionRate,
    provisionAmount: rating.provisionAmount,
    previousGrade: rating.previousGrade,
    ratingReason: rating.ratingReason,
    isCurrent: rating.isCurrent,
    ratedAt: rating.ratedAt.toISOString(),
  };
}

export function toAccountRatingResponse(
  rating: B2BAccountRiskRatingModel,
): Record<string, unknown> {
  return {
    id: rating.id,
    accountId: rating.accountId,
    policyVersionId: rating.policyVersionId,
    grade: rating.grade,
    gradeLabel: rating.gradeLabel,
    severityRank: rating.severityRank,
    worstDaysPastDue: rating.worstDaysPastDue,
    ratedReceivableCount: rating.ratedReceivableCount,
    totalExposureAmount: rating.totalExposureAmount,
    totalProvisionAmount: rating.totalProvisionAmount,
    drivingReceivableId: rating.drivingReceivableId,
    previousGrade: rating.previousGrade,
    ratingReason: rating.ratingReason,
    isCurrent: rating.isCurrent,
    ratedAt: rating.ratedAt.toISOString(),
  };
}

/**
 * `SUM` sobre un grupo vacío devuelve `NULL` en Postgres, no cero. Se normaliza aquí porque quien
 * consume esta respuesta la suma para el cierre, y un `null` en medio de esa suma la convierte en
 * `NaN` sin decir dónde se rompió.
 */
function toPortfolioGradeResponse(row: PortfolioGradeRow): {
  grade: string;
  gradeLabel: string;
  severityRank: number;
  receivableCount: number;
  exposureAmount: string;
  provisionAmount: string;
} {
  return {
    grade: row.grade,
    gradeLabel: row.gradeLabel,
    severityRank: Number(row.severityRank),
    receivableCount: Number(row.receivableCount),
    exposureAmount: row.exposureAmount ?? '0.00',
    provisionAmount: row.provisionAmount ?? '0.00',
  };
}

/** Suma decimales pasando por céntimos enteros: es el número que se cuadra contra el mayor. */
function sumDecimals(values: readonly string[]): string {
  return fromCents(sumCents(values.map((value) => toCents(value))));
}
