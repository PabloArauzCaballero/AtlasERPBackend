import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import type { Transaction } from 'sequelize';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import { toMinorUnits } from '../../../common/money/decimal-amount.util';
import { businessDate } from '../../../common/time/business-date';
import { env } from '../../../config/env';
import { InstallmentStatus } from '../b2b-sales-crm.enums';
import { PaymentNoticeStatus } from '../domain/coverage-eligibility';
import { CoverageReviewItemModel, CoverageReviewReason } from '../models/coverage.models';
import { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';

/** Lo que pasó en una pasada. */
export interface OverdueSweepResult {
  corte: string;
  /** Cuotas SCHEDULED con vencimiento anterior al día de negocio. */
  revisadas: number;
  /** Pasaron a OVERDUE en esta pasada. */
  marcadas: number;
  /** Los pagos CONFIRMADOS cubren la cuota: no está en mora. */
  conPago: number;
  /** Con aviso REPORTED dentro del plazo de verificación: siguen SCHEDULED, NO pagadas. */
  avisoPendiente: number;
  /** Avisos REPORTED que vencieron su plazo y se abrieron en la cola de revisión en esta pasada. */
  enRevision: number;
}

export interface OverdueSweepOptions {
  now?: Date;
  /** Horas que un aviso REPORTED espera antes de ir a revisión (por defecto, la variable de entorno). */
  noticeReviewHours?: number;
}

/**
 * Marca OVERDUE las cuotas BNPL vencidas sin pago CONFIRMADO y manda a revisión los avisos de pago
 * que nadie confirmó a tiempo.
 *
 * Hasta el 2026-09-24 un aviso REPORTED —el consumidor dice que pagó, nadie lo verificó— contaba
 * igual que un pago CONFIRMED: la cuota quedaba «pagada» para siempre sin que nadie lo comprobara.
 * Ahora un aviso REPORTED da un plazo (`BNPL_PAYMENT_NOTICE_REVIEW_HOURS`, 72 h por defecto) en el
 * que la cuota no se marca en mora; vencido el plazo la cuota pasa a OVERDUE (no hay pago
 * confirmado) y el aviso entra en la cola de revisión visible (`coverage_review_items`). Un aviso
 * REJECTED no cuenta para nada.
 *
 * El corte es el día de negocio de Bolivia (`businessDate`), no el día UTC.
 *
 * Idempotente: una cuota ya OVERDUE no se vuelve a marcar y una revisión abierta no se duplica
 * (índice único parcial).
 */
@Injectable()
export class B2BOverdueSweepService {
  constructor(
    private readonly repository: B2BSalesCrmRepository,
    private readonly logger: PinoLoggerService,
    @InjectModel(CoverageReviewItemModel)
    private readonly reviewItems: typeof CoverageReviewItemModel,
  ) {}

  async sweep(today?: string, options: OverdueSweepOptions = {}): Promise<OverdueSweepResult> {
    const now = options.now ?? new Date();
    const corte = today ?? businessDate(now);
    const hours = options.noticeReviewHours ?? env.BNPL_PAYMENT_NOTICE_REVIEW_HOURS;
    const reviewDeadline = new Date(now.getTime() - hours * 3_600_000);

    return this.repository.transaction(async (transaction) => {
      const vencidas = await this.repository.installments.findAll({
        attributes: ['id', 'amount', 'status'],
        where: {
          status: { [Op.in]: [InstallmentStatus.SCHEDULED, InstallmentStatus.OVERDUE] },
          dueDate: { [Op.lt]: corte },
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const result: OverdueSweepResult = {
        corte,
        revisadas: 0,
        marcadas: 0,
        conPago: 0,
        avisoPendiente: 0,
        enRevision: 0,
      };
      if (vencidas.length === 0) return result;

      const avisos = await this.repository.consumerPaymentsToMerchant.findAll({
        attributes: ['id', 'installmentId', 'amount', 'status', 'createdAt'],
        where: {
          installmentId: { [Op.in]: vencidas.map((cuota) => cuota.id) },
          status: { [Op.in]: [PaymentNoticeStatus.REPORTED, PaymentNoticeStatus.CONFIRMED] },
        },
        transaction,
      });

      const aMarcar: string[] = [];
      for (const cuota of vencidas) {
        const propios = avisos.filter((aviso) => aviso.installmentId === cuota.id);
        const confirmado = propios
          .filter((aviso) => aviso.status === PaymentNoticeStatus.CONFIRMED)
          .reduce((sum, aviso) => sum + toMinorUnits(aviso.amount), 0n);
        const pendientes = propios.filter((aviso) => aviso.status === PaymentNoticeStatus.REPORTED);
        const vencidosSinVerificar = pendientes.filter(
          (aviso) => new Date(aviso.createdAt).getTime() <= reviewDeadline.getTime(),
        );
        const esProgramada = cuota.status === InstallmentStatus.SCHEDULED;
        if (esProgramada) result.revisadas += 1;

        if (confirmado >= toMinorUnits(cuota.amount)) {
          if (esProgramada) result.conPago += 1;
          continue;
        }

        if (vencidosSinVerificar.length > 0) {
          const abierta = await this.openReview(
            cuota.id,
            vencidosSinVerificar.map((aviso) => aviso.id),
            hours,
            transaction,
          );
          if (abierta) result.enRevision += 1;
        } else if (pendientes.length > 0) {
          // Dentro del plazo: ni pagada ni en mora todavía.
          if (esProgramada) result.avisoPendiente += 1;
          continue;
        }
        if (esProgramada) aMarcar.push(cuota.id);
      }

      if (aMarcar.length > 0) {
        await this.repository.installments.update(
          { status: InstallmentStatus.OVERDUE },
          { where: { id: { [Op.in]: aMarcar } }, transaction },
        );
      }
      result.marcadas = aMarcar.length;
      this.logger.infoContext(B2BOverdueSweepService.name, 'BNPL overdue sweep', {
        ...result,
      });
      return result;
    });
  }

  /** Abre la revisión si no hay una abierta. Devuelve si la abrió en esta pasada. */
  private async openReview(
    installmentId: string,
    noticeIds: string[],
    hours: number,
    transaction: Transaction,
  ): Promise<boolean> {
    const open = await this.reviewItems.findOne({
      where: {
        installmentId,
        reason: CoverageReviewReason.PAYMENT_NOTICE_UNRESOLVED,
        status: 'OPEN',
      },
      transaction,
    });
    if (open) return false;
    await this.reviewItems.create(
      {
        installmentId,
        reason: CoverageReviewReason.PAYMENT_NOTICE_UNRESOLVED,
        status: 'OPEN',
        details: { noticeIds, reviewAfterHours: hours },
      },
      { transaction },
    );
    return true;
  }
}
