import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import type { Transaction, WhereOptions } from 'sequelize';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import { fromMinorUnits, toMinorUnits } from '../../../common/money/decimal-amount.util';
import { businessDate, isPastDue } from '../../../common/time/business-date';
import { InstallmentStatus, PayableStatus } from '../b2b-sales-crm.enums';
import type { ResolveCoverageReviewItemDto, ReviewQueueQueryDto } from '../b2b-sales-crm.dtos';
import { PaymentNoticeStatus } from '../domain/coverage-eligibility';
import type {
  BNPLInstallmentModel,
  ConsumerPaymentToMerchantModel,
} from '../models/b2b-sales-crm.models';
import {
  CoverageReviewItemModel,
  CoverageReviewReason,
  CoverageReviewResolution,
} from '../models/coverage.models';
import { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';
import type { CoverageActor } from './b2b-coverage.service';

/** Razones que hablan de un aviso de pago REPORTED; se cierran decidiendo el aviso. */
const NOTICE_REASONS = new Set<string>([
  CoverageReviewReason.PAYMENT_NOTICE_UNRESOLVED,
  CoverageReviewReason.COVERAGE_WITH_PENDING_NOTICE,
]);

type ReviewAction = ResolveCoverageReviewItemDto['action'];

/**
 * Resolución de la cola de revisión de cobertura (P-04 · 2026-09-24).
 *
 * La cola nació sin salida: un aviso de pago REPORTED que nadie verificó a tiempo quedaba ahí para
 * siempre, la cuota no se podía dar por pagada ni cubrir, y el único cierre era programar la
 * cobertura —justo lo que el aviso impedía—. Ahora una persona de finanzas lo resuelve con doble
 * criterio y deja rastro:
 *
 *  - Criterio de ESTADO, comprobado con lock (cuota → elemento → aviso): el elemento sigue abierto y
 *    el aviso sigue REPORTED en el momento de decidir. Dos resoluciones simultáneas se serializan
 *    en la cuota y la segunda recibe 409 `REVIEW_ITEM_ALREADY_RESOLVED`.
 *  - Criterio de PERSONA: quien abrió el elemento (quien pidió la cobertura) no lo resuelve; lo que
 *    abrió el barrido automático lo resuelve cualquier persona con el rol.
 *
 * Desenlaces:
 *  - CONFIRM_NOTICE: el aviso pasa a CONFIRMED y descuenta del saldo; si los pagos confirmados cubren
 *    la cuota, ésta queda PAID_TO_MERCHANT. Nunca sobre una cuota con cobertura viva (doble
 *    beneficio): primero se cancela la cobertura.
 *  - REJECT_NOTICE: el aviso pasa a REJECTED; la cuota vencida vuelve a ser cubrible (y se marca
 *    OVERDUE si el aviso era lo único que lo impedía).
 *  - DISMISS: se descarta sin tocar dinero. Sólo para «contrato no activo», o para un elemento de
 *    aviso cuyo aviso ya no está pendiente (se decidió por otra vía).
 *
 * El elemento cerrado no se borra ni se edita (disparador en la base): guarda desenlace, actor,
 * motivo y fecha. El aviso guarda su propia decisión (quién, cuándo, nota).
 */
@Injectable()
export class B2BCoverageReviewService {
  constructor(
    private readonly repository: B2BSalesCrmRepository,
    private readonly logger: PinoLoggerService,
    @InjectModel(CoverageReviewItemModel)
    private readonly reviewItems: typeof CoverageReviewItemModel,
  ) {}

  /**
   * La cola, con lo que hace falta para decidir desde la fila: la cuota, los avisos pendientes y
   * qué acciones admite el elemento PARA QUIEN PREGUNTA (vacío si fue quien lo abrió).
   */
  async listReviewQueue(
    actor?: CoverageActor,
    query: ReviewQueueQueryDto = { status: 'OPEN' },
  ): Promise<Record<string, unknown>[]> {
    const where: WhereOptions = query.status === 'ALL' ? {} : { status: query.status };
    const rows = await this.reviewItems.findAll({
      where,
      order: query.status === 'OPEN' ? [['openedAt', 'ASC']] : [['openedAt', 'DESC']],
      limit: 200,
    });
    if (rows.length === 0) return [];

    const installmentIds = [...new Set(rows.map((row) => row.installmentId))];
    const installments = await this.repository.installments.findAll({
      where: { id: { [Op.in]: installmentIds } },
    });
    const pending = await this.repository.consumerPaymentsToMerchant.findAll({
      where: {
        installmentId: { [Op.in]: installmentIds },
        status: PaymentNoticeStatus.REPORTED,
      },
      order: [['createdAt', 'ASC']],
    });
    const byId = new Map(installments.map((row) => [row.id, row]));

    return rows.map((item) => {
      const installment = byId.get(item.installmentId);
      const notices = pending.filter((notice) => notice.installmentId === item.installmentId);
      const openedByMe = Boolean(actor && item.openedByUserId === actor.userId);
      return {
        ...toReviewItemResponse(item),
        openedByMe,
        installment: installment
          ? {
              id: installment.id,
              purchaseId: installment.purchaseId,
              installmentNumber: installment.installmentNumber,
              dueDate: installment.dueDate,
              amount: installment.amount,
              status: installment.status,
            }
          : null,
        pendingNotices: notices.map(toNoticeResponse),
        allowedActions:
          item.status !== 'OPEN' || openedByMe ? [] : allowedActions(item, notices.length),
      };
    });
  }

  async resolveReviewItem(
    reviewItemId: string,
    input: ResolveCoverageReviewItemDto,
    actor: CoverageActor,
    now: Date = new Date(),
  ): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BCoverageReviewService.name, 'B2B CRM use case started', {
      useCase: 'resolveCoverageReviewItem',
      action: input.action,
    });
    const found = await this.reviewItems.findByPk(reviewItemId);
    if (!found) throw new NotFoundException('Elemento de revisión no encontrado.');

    return this.repository.transaction(async (transaction) => {
      // Mismo orden de locks que `scheduleCoverage` y el barrido: primero la cuota.
      const installment = await this.repository.installments.findByPk(found.installmentId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!installment) throw new NotFoundException('Cuota de la revisión no encontrada.');
      const item = await this.reviewItems.findByPk(reviewItemId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!item) throw new NotFoundException('Elemento de revisión no encontrado.');

      if (item.status !== 'OPEN') {
        throw new ConflictException({
          code: 'REVIEW_ITEM_ALREADY_RESOLVED',
          message: `El elemento ya se resolvió (${item.resolution ?? item.status}).`,
        });
      }
      if (item.openedByUserId && item.openedByUserId === actor.userId) {
        throw new ForbiddenException({
          code: 'FOUR_EYES_REQUIRED',
          message: 'Quien pidió la cobertura que abrió esta revisión no puede resolverla.',
        });
      }

      const pending = await this.repository.consumerPaymentsToMerchant.findAll({
        where: { installmentId: installment.id, status: PaymentNoticeStatus.REPORTED },
        order: [['createdAt', 'ASC']],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (input.action === 'DISMISS') {
        return this.dismiss(item, installment, pending.length, input.note, actor, now, transaction);
      }
      return this.decideNotice(item, installment, pending, input, actor, now, transaction);
    });
  }

  private async dismiss(
    item: CoverageReviewItemModel,
    installment: BNPLInstallmentModel,
    pendingCount: number,
    note: string,
    actor: CoverageActor,
    now: Date,
    transaction: Transaction,
  ): Promise<Record<string, unknown>> {
    if (!allowedActions(item, pendingCount).includes('DISMISS')) {
      throw new ConflictException({
        code: 'REVIEW_ACTION_NOT_ALLOWED',
        message:
          'Este elemento tiene un aviso de pago pendiente: se resuelve confirmando o rechazando el aviso, no descartándolo.',
      });
    }
    await this.close(item, CoverageReviewResolution.DISMISSED, note, actor, now, transaction);
    return {
      outcome: CoverageReviewResolution.DISMISSED,
      reviewItem: toReviewItemResponse(item),
      closedReviewItemIds: [item.id],
      notice: null,
      installment: await this.installmentState(installment, transaction),
    };
  }

  private async decideNotice(
    item: CoverageReviewItemModel,
    installment: BNPLInstallmentModel,
    pending: ConsumerPaymentToMerchantModel[],
    input: ResolveCoverageReviewItemDto,
    actor: CoverageActor,
    now: Date,
    transaction: Transaction,
  ): Promise<Record<string, unknown>> {
    if (!NOTICE_REASONS.has(item.reason)) {
      throw new ConflictException({
        code: 'REVIEW_ACTION_NOT_ALLOWED',
        message:
          'Este elemento no trata de un aviso de pago: sólo se puede descartar con un motivo.',
      });
    }
    const notice = pickNotice(pending, input.noticeId);

    const confirming = input.action === 'CONFIRM_NOTICE';
    if (confirming) {
      const livePayable = await this.repository.payables.findOne({
        where: { installmentId: installment.id, status: { [Op.ne]: PayableStatus.CANCELLED } },
        transaction,
      });
      if (livePayable || installment.status === InstallmentStatus.COVERED_BY_ATLAS) {
        throw new ConflictException({
          code: 'COVERAGE_IN_PLACE',
          message:
            'La cuota ya tiene una cobertura de Atlas: cancélela antes de confirmar el aviso, o registre el cobro como recuperación.',
        });
      }
    }

    await notice.update(
      {
        status: confirming ? PaymentNoticeStatus.CONFIRMED : PaymentNoticeStatus.REJECTED,
        decidedByUserId: actor.userId,
        decidedAt: now,
        decisionNote: input.note,
      },
      { transaction },
    );

    const confirmedMinor = await this.confirmedMinor(installment.id, transaction);
    const stillPending = pending.length - 1;
    if (confirming && confirmedMinor >= toMinorUnits(installment.amount)) {
      await installment.update(
        { status: InstallmentStatus.PAID_TO_MERCHANT, paidToMerchantAt: notice.paidAt },
        { transaction },
      );
    } else if (
      !confirming &&
      stillPending === 0 &&
      installment.status === InstallmentStatus.SCHEDULED &&
      isPastDue(installment.dueDate, businessDate(now))
    ) {
      // El aviso era lo único que frenaba la mora: sin él, la cuota vencida está en mora.
      await installment.update({ status: InstallmentStatus.OVERDUE }, { transaction });
    }

    // Mientras quede otro aviso pendiente de la misma cuota, la revisión sigue abierta.
    const resolution = confirming
      ? CoverageReviewResolution.NOTICE_CONFIRMED
      : CoverageReviewResolution.NOTICE_REJECTED;
    const closed: string[] = [];
    if (stillPending === 0) {
      const siblings = await this.reviewItems.findAll({
        where: {
          installmentId: installment.id,
          status: 'OPEN',
          reason: { [Op.in]: [...NOTICE_REASONS] },
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      for (const sibling of siblings) {
        await this.close(sibling, resolution, input.note, actor, now, transaction);
        closed.push(sibling.id);
      }
    }

    return {
      outcome: resolution,
      reviewItem: toReviewItemResponse(item),
      closedReviewItemIds: closed,
      notice: toNoticeResponse(notice),
      pendingNoticesLeft: stillPending,
      installment: await this.installmentState(installment, transaction, confirmedMinor),
    };
  }

  private async close(
    item: CoverageReviewItemModel,
    resolution: CoverageReviewResolution,
    note: string,
    actor: CoverageActor,
    now: Date,
    transaction: Transaction,
  ): Promise<void> {
    await item.update(
      {
        status: 'RESOLVED',
        resolution,
        resolvedAt: now,
        resolvedByUserId: actor.userId,
        resolutionNote: note,
      },
      { transaction },
    );
  }

  private async confirmedMinor(installmentId: string, transaction: Transaction): Promise<bigint> {
    const confirmed = await this.repository.consumerPaymentsToMerchant.findAll({
      attributes: ['amount'],
      where: { installmentId, status: PaymentNoticeStatus.CONFIRMED },
      transaction,
    });
    return confirmed.reduce((sum, row) => sum + toMinorUnits(row.amount), 0n);
  }

  private async installmentState(
    installment: BNPLInstallmentModel,
    transaction: Transaction,
    knownConfirmedMinor?: bigint,
  ): Promise<Record<string, unknown>> {
    const confirmedMinor =
      knownConfirmedMinor ?? (await this.confirmedMinor(installment.id, transaction));
    const balance = toMinorUnits(installment.amount) - confirmedMinor;
    return {
      id: installment.id,
      status: installment.status,
      amount: installment.amount,
      confirmedPaidAmount: fromMinorUnits(confirmedMinor),
      balance: fromMinorUnits(balance > 0n ? balance : 0n),
    };
  }
}

/** Qué se puede hacer con un elemento abierto, según su motivo y si queda aviso pendiente. */
function allowedActions(item: CoverageReviewItemModel, pendingCount: number): ReviewAction[] {
  if (item.reason === CoverageReviewReason.CONTRACT_NOT_ACTIVE) return ['DISMISS'];
  if (NOTICE_REASONS.has(item.reason)) {
    return pendingCount > 0 ? ['CONFIRM_NOTICE', 'REJECT_NOTICE'] : ['DISMISS'];
  }
  return [];
}

function pickNotice(
  pending: ConsumerPaymentToMerchantModel[],
  noticeId: string | undefined,
): ConsumerPaymentToMerchantModel {
  if (pending.length === 0) {
    throw new ConflictException({
      code: 'NO_PENDING_NOTICE',
      message:
        'La cuota ya no tiene avisos de pago pendientes: descarte la revisión con un motivo.',
    });
  }
  if (noticeId) {
    const chosen = pending.find((notice) => notice.id === noticeId);
    if (!chosen) {
      throw new ConflictException({
        code: 'NOTICE_NOT_PENDING',
        message: 'Ese aviso de pago no está pendiente en esta cuota.',
      });
    }
    return chosen;
  }
  if (pending.length > 1) {
    throw new UnprocessableEntityException({
      code: 'NOTICE_ID_REQUIRED',
      message: 'La cuota tiene varios avisos pendientes: indique cuál se decide.',
    });
  }
  return pending[0]!;
}

function toNoticeResponse(row: ConsumerPaymentToMerchantModel): Record<string, unknown> {
  return {
    id: row.id,
    amount: row.amount,
    paidAt: row.paidAt,
    evidenceRef: row.evidenceRef,
    status: row.status,
    reportedAt: row.createdAt,
    decidedByUserId: row.decidedByUserId ?? null,
    decidedAt: row.decidedAt ?? null,
    decisionNote: row.decisionNote ?? null,
  };
}

export function toReviewItemResponse(item: CoverageReviewItemModel): Record<string, unknown> {
  return {
    id: item.id,
    installmentId: item.installmentId,
    reason: item.reason,
    status: item.status,
    details: item.details,
    openedAt: item.openedAt,
    openedByUserId: item.openedByUserId,
    resolution: item.resolution ?? null,
    resolvedAt: item.resolvedAt,
    resolvedByUserId: item.resolvedByUserId,
    resolutionNote: item.resolutionNote,
  };
}
