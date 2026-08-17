import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Transaction } from 'sequelize';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import { ReceivableStatus } from '../b2b-sales-crm.enums';
import { rateAccount, type RatedReceivable } from '../domain/account-rating';
import { fromCents, toCents } from '../domain/money.util';
import {
  daysPastDueFor,
  normalizeScale,
  rateReceivable,
  type RatingBand,
} from '../domain/rating-scale';
import type {
  B2BAccountRiskRatingModel,
  RatingPolicyVersionModel,
} from '../models/credit-rating.models';
import { CreditRatingRepository } from '../repositories/credit-rating.repository';

/** La política vigente con su escala ya validada: lo único que hace falta para calificar. */
interface ResolvedPolicy {
  policy: RatingPolicyVersionModel;
  bands: RatingBand[];
  bestBand: RatingBand;
}

@Injectable()
export class B2BCreditRatingService {
  constructor(
    private readonly repository: CreditRatingRepository,
    private readonly logger: PinoLoggerService,
  ) {}

  /**
   * Resuelve la matriz con la que se va a calificar, o falla diciendo por qué no se puede.
   *
   * Falla en vez de aplicar una escala por defecto escrita en código, y esa es la decisión central
   * del motor: una previsión calculada con umbrales que nadie aprobó es indistinguible en la base de
   * una legítima, y cuando alguien lo descubra la cartera ya está calificada con dos matrices sin
   * columna que diga cuál usó cada fila. Un error explícito se arregla en un minuto activando la
   * política; una previsión inventada no se detecta nunca.
   */
  private async resolvePolicy(transaction?: Transaction): Promise<ResolvedPolicy> {
    const policy = await this.repository.findActivePolicy(transaction);
    if (!policy) {
      throw new UnprocessableEntityException('RATING_POLICY_NOT_ACTIVE');
    }

    const rows = await this.repository.findBands(policy.id, transaction);
    const bands: RatingBand[] = rows.map((row) => ({
      grade: row.grade,
      gradeLabel: row.gradeLabel,
      severityRank: row.severityRank,
      minDaysPastDue: row.minDaysPastDue,
      maxDaysPastDue: row.maxDaysPastDue,
      // `numeric` llega como string desde Postgres para no perder precisión; la conversión ocurre
      // una sola vez, aquí, y el resto del motor ya trabaja con un número validado.
      provisionRate: Number.parseFloat(String(row.provisionRate)),
    }));

    let ordered: RatingBand[];
    try {
      ordered = normalizeScale(bands);
    } catch (error) {
      // Una escala rota es un fallo de CONFIGURACIÓN, no de la petición: el mensaje nombra la
      // política concreta porque el operador necesita saber cuál arreglar.
      throw new UnprocessableEntityException(
        `RATING_POLICY_SCALE_INVALID: ${policy.policyCode}/${policy.versionCode} — ${(error as Error).message}`,
      );
    }

    const bestBand = ordered.at(0);
    if (!bestBand || bands.some((band) => !Number.isFinite(band.provisionRate))) {
      throw new UnprocessableEntityException(
        `RATING_POLICY_SCALE_INVALID: ${policy.policyCode}/${policy.versionCode} — previsión no numérica.`,
      );
    }

    return { policy, bands: ordered, bestBand };
  }

  /**
   * Califica todas las cuentas por cobrar de un cliente y, con ellas, al cliente.
   *
   * Es una sola transacción porque la calificación de la cuenta se DERIVA de la de sus documentos:
   * separarlas abre una ventana en la que la factura ya está en categoría D y el comercio sigue
   * figurando en A, que es justo el instante en el que alguien decide si le amplía la línea.
   */
  async rateAccountById(accountId: string, asOf: Date = new Date()) {
    this.logger.infoContext(B2BCreditRatingService.name, 'B2B CRM use case started', {
      useCase: 'rateAccount',
    });

    return this.repository.sequelize.transaction(async (transaction) => {
      const account = await this.repository.accounts.findByPk(accountId, { transaction });
      if (!account) {
        throw new NotFoundException('Cuenta B2B no encontrada.');
      }

      const resolved = await this.resolvePolicy(transaction);
      const receivables = await this.repository.findOpenReceivables(accountId, transaction);
      const rated: RatedReceivable[] = [];

      for (const receivable of receivables) {
        const rating = rateReceivable(resolved.bands, {
          daysPastDue: daysPastDueFor(receivable.dueDate, asOf),
          exposureCents: toCents(receivable.amountOpen),
          disputed: receivable.status === ReceivableStatus.DISPUTED,
        });
        const previous = await this.repository.findCurrentReceivableRating(
          receivable.id,
          transaction,
        );

        await this.repository.supersedeReceivableRating(
          receivable.id,
          {
            receivableId: receivable.id,
            accountId,
            policyVersionId: resolved.policy.id,
            grade: rating.band.grade,
            gradeLabel: rating.band.gradeLabel,
            severityRank: rating.band.severityRank,
            daysPastDue: rating.daysPastDue,
            receivableStatus: receivable.status,
            exposureAmount: fromCents(rating.exposureCents),
            provisionRate: rating.band.provisionRate.toFixed(4),
            provisionAmount: fromCents(rating.provisionCents),
            previousGrade: previous?.grade ?? null,
            ratingReason: rating.reason,
            isCurrent: true,
            ratedAt: asOf,
          },
          transaction,
        );
        rated.push({ receivableId: receivable.id, rating });
      }

      const accountRating = await this.persistAccountRating(
        accountId,
        rated,
        resolved,
        asOf,
        transaction,
      );
      await this.repository.projectGradeOnAccount(
        accountId,
        accountRating.grade,
        asOf,
        transaction,
      );

      return { ratedReceivables: rated.length, accountRating };
    });
  }

  /**
   * Barrido de calificación de toda la cartera.
   *
   * Una cuenta que falla no detiene el barrido: el resto quedaría sin calificar y el dato de un
   * cierre no se recupera al día siguiente. Lo que sí se devuelve es cuáles fallaron, porque un
   * barrido que sólo dijera «ok» habiendo calificado la mitad es peor que uno que falla.
   */
  async sweep(limit: number, asOf: Date = new Date()) {
    const accountIds = await this.repository.findAccountIdsWithOpenDebt(limit);
    const failures: string[] = [];
    let rated = 0;

    for (const accountId of accountIds) {
      try {
        await this.rateAccountById(accountId, asOf);
        rated += 1;
      } catch (error) {
        failures.push(accountId);
        this.logger.errorContext(
          B2BCreditRatingService.name,
          'No se pudo calificar la cuenta B2B',
          {
            accountId,
            reason: (error as Error).message,
          },
        );
      }
    }

    return {
      accounts: accountIds.length,
      rated,
      failed: failures.length,
      failedAccountIds: failures,
    };
  }

  private async persistAccountRating(
    accountId: string,
    receivables: readonly RatedReceivable[],
    resolved: ResolvedPolicy,
    asOf: Date,
    transaction: Transaction,
  ): Promise<B2BAccountRiskRatingModel> {
    const previous = await this.repository.findCurrentAccountRating(accountId, transaction);
    const rating = rateAccount({
      receivables,
      bestBand: resolved.bestBand,
      applyContamination: resolved.policy.contaminationEnabled,
    });

    return this.repository.supersedeAccountRating(
      accountId,
      {
        accountId,
        policyVersionId: resolved.policy.id,
        grade: rating.band.grade,
        gradeLabel: rating.band.gradeLabel,
        severityRank: rating.band.severityRank,
        worstDaysPastDue: rating.worstDaysPastDue,
        ratedReceivableCount: rating.ratedReceivableCount,
        totalExposureAmount: fromCents(rating.totalExposureCents),
        totalProvisionAmount: fromCents(rating.totalProvisionCents),
        drivingReceivableId: rating.drivingReceivableId,
        previousGrade: previous?.grade ?? null,
        ratingReason: rating.reason,
        isCurrent: true,
        ratedAt: asOf,
      },
      transaction,
    );
  }
}
