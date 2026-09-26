/**
 * Consumidor de `payment.reported/confirmed/rejected` de Core (P-14 · P-08 · B20).
 *
 * Core es la fuente de la cuota y de sus pagos; el ERP, de la cobertura. Cuando el comercio
 * autorizado confirma en Core que recibió el pago de una cuota, el ERP tiene que saberlo para no
 * cubrir una cuota que ya se pagó —o, si llegó tarde y la cobertura ya existe, para no pagar dos
 * veces—. Reglas:
 *
 *  - Una sola vez: `consumeOnce` registra la clave del evento en la inbox con el efecto, en la misma
 *    transacción. Diez entregas → un efecto. El 2xx sale tras el commit (ACK duradero).
 *  - Un aviso de Core es UN aviso del ERP (`core_tenant_id` + `core_claim_id` únicos). Su estado sólo
 *    avanza REPORTED → CONFIRMED | REJECTED: un `payment.reported` que llega después de la decisión no
 *    la revierte, y una decisión contraria a la ya aplicada no se aplica (se registra).
 *  - Confirmar usa la MISMA transición que la cola de revisión (`applyNoticeDecision`). No pide
 *    segunda persona: la confirmación la hizo el comercio que recibió el dinero, autenticado en Core
 *    con su sesión y sólo sobre sus propias compras (P-08). Decisión documentada en decisions.md P-14.
 *  - Con cobertura viva (CxP no cancelada o cuota COVERED_BY_ATLAS) NO se confirma: el aviso queda
 *    REPORTED y se abre `LATE_PAYMENT_WITH_COVERAGE` en la cola. Nada de doble beneficio.
 *  - Lo que no se puede aplicar sin adivinar (cuota sin mapeo, moneda distinta, decisión
 *    contradictoria) se ACUSA y queda en `core_event_exceptions`: reintentar no lo arreglaría y
 *    bloquearía la cola de esa cuota en Core.
 */
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { QueryTypes, type Transaction } from 'sequelize';
import { consumeOnce } from '../../../common/events/event-inbox';
import { sequelizeQueryable } from '../../../common/events/queryable';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import { normalizeAmount } from '../../../common/money/decimal-amount.util';
import { PaymentNoticeStatus } from '../domain/coverage-eligibility';
import type {
  BNPLInstallmentModel,
  ConsumerPaymentToMerchantModel,
} from '../models/b2b-sales-crm.models';
import { CoverageReviewReason } from '../models/coverage.models';
import { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';
import { applyNoticeDecision, hasLiveCoverage } from '../services/notice-decision.support';
import {
  CONSUMED_CORE_TOPICS,
  isConsumedCoreTopic,
  type CoreEnvelope,
  type PaymentConfirmed,
  type PaymentRejected,
  type PaymentReported,
} from './core-events.schemas';

export const CORE_PAYMENTS_CONSUMER = 'core-payments';
/** Moneda de las cuotas BNPL del ERP (las CxP nacen con `currency` BOB por defecto). */
export const ERP_INSTALLMENT_CURRENCY = 'BOB';

export type CoreEventOutcome =
  | 'DUPLICATE'
  | 'NOTICE_REPORTED'
  | 'NOTICE_CONFIRMED'
  | 'NOTICE_REJECTED'
  | 'LATE_PAYMENT_REVIEW'
  | 'NO_CHANGE'
  | 'EXCEPTION';

type ExceptionReason = 'UNLINKED_INSTALLMENT' | 'CURRENCY_MISMATCH' | 'CONFLICTING_DECISION';
type Parsed =
  | { topic: 'payment.reported'; payload: PaymentReported }
  | { topic: 'payment.confirmed'; payload: PaymentConfirmed }
  | { topic: 'payment.rejected'; payload: PaymentRejected };

interface Link {
  erp_purchase_id: string;
  erp_installment_id: string;
  core_loan_id: string;
}

@Injectable()
export class CorePaymentEventsService {
  constructor(
    private readonly repository: B2BSalesCrmRepository,
    private readonly logger: PinoLoggerService,
  ) {}

  async receive(
    envelope: CoreEnvelope,
    now: Date = new Date(),
  ): Promise<{ outcome: CoreEventOutcome }> {
    const parsed = parse(envelope);
    const tenantId = envelope.tenantId!;
    return this.repository.transaction(async (transaction) => {
      const tx = sequelizeQueryable(this.repository.sequelize, transaction);
      const result = await consumeOnce(
        tx,
        {
          consumer: CORE_PAYMENTS_CONSUMER,
          event: {
            eventKey: envelope.eventKey,
            topic: envelope.topic,
            schemaVersion: envelope.schemaVersion,
            aggregate: envelope.aggregate,
          },
          // Cada aviso es un efecto propio y su estado sólo avanza: no se descarta por versión.
          ordering: 'every-event',
        },
        async () => {
          const outcome = await this.apply(envelope, parsed, tenantId, now, transaction);
          if (outcome === 'EXCEPTION') {
            await tx.query(
              `UPDATE atlas_accounting.event_inbox SET outcome = 'EXCEPTION'
                WHERE consumer = $1 AND event_key = $2`,
              [CORE_PAYMENTS_CONSUMER, envelope.eventKey],
            );
          }
          return outcome;
        },
      );
      if (result.status === 'DUPLICATE') return { outcome: 'DUPLICATE' as const };
      if (result.status === 'STALE') return { outcome: 'NO_CHANGE' as const };
      this.logger.infoContext(CorePaymentEventsService.name, 'Evento de Core aplicado', {
        topic: envelope.topic,
        eventKey: envelope.eventKey,
        outcome: result.value,
      });
      return { outcome: result.value };
    });
  }

  private async apply(
    envelope: CoreEnvelope,
    parsed: Parsed,
    tenantId: string,
    now: Date,
    transaction: Transaction,
  ): Promise<CoreEventOutcome> {
    const { payload } = parsed;
    const link = await this.findLink(tenantId, payload.installmentId, transaction);
    if (!link || link.core_loan_id !== payload.loanId) {
      return this.exception(envelope, 'UNLINKED_INSTALLMENT', tenantId, transaction);
    }
    if (payload.currencyCode !== ERP_INSTALLMENT_CURRENCY) {
      return this.exception(envelope, 'CURRENCY_MISMATCH', tenantId, transaction);
    }

    // Mismo orden de locks que la cobertura, el barrido y la cola: primero la cuota.
    const installment = await this.repository.installments.findByPk(link.erp_installment_id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!installment)
      return this.exception(envelope, 'UNLINKED_INSTALLMENT', tenantId, transaction);

    const existing = await this.repository.consumerPaymentsToMerchant.findOne({
      where: { coreTenantId: tenantId, coreClaimId: payload.claimId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (parsed.topic === 'payment.reported') {
      if (existing) return 'NO_CHANGE';
      await this.createNotice(
        link,
        installment,
        tenantId,
        parsed.payload,
        envelope.occurredAt,
        transaction,
      );
      return 'NOTICE_REPORTED';
    }

    const confirming = parsed.topic === 'payment.confirmed';
    const target = confirming ? PaymentNoticeStatus.CONFIRMED : PaymentNoticeStatus.REJECTED;
    if (existing && existing.status === target) return 'NO_CHANGE';
    if (existing && existing.status !== PaymentNoticeStatus.REPORTED) {
      return this.exception(envelope, 'CONFLICTING_DECISION', tenantId, transaction);
    }
    // La decisión puede llegar antes que el aviso (desorden) o sin él: se crea y se decide.
    const notice =
      existing ??
      (await this.createNotice(
        link,
        installment,
        tenantId,
        payload,
        envelope.occurredAt,
        transaction,
      ));

    if (confirming && (await hasLiveCoverage(this.repository, installment, transaction))) {
      await this.openLatePaymentReview(installment, notice, parsed.payload, now, transaction);
      return 'LATE_PAYMENT_REVIEW';
    }

    const pending = await this.repository.consumerPaymentsToMerchant.count({
      where: { installmentId: installment.id, status: PaymentNoticeStatus.REPORTED },
      transaction,
    });
    const decidedAt = new Date((parsed.payload as PaymentConfirmed | PaymentRejected).decidedAt);
    await applyNoticeDecision(this.repository, {
      installment,
      notice,
      pendingCount: pending,
      confirming,
      decidedByUserId: null,
      note: confirming
        ? `Confirmado por el comercio en Core (aviso ${payload.claimCode}).`
        : `Rechazado por el comercio en Core (aviso ${payload.claimCode}).`,
      now: decidedAt,
      transaction,
    });
    return confirming ? 'NOTICE_CONFIRMED' : 'NOTICE_REJECTED';
  }

  private async findLink(
    tenantId: string,
    coreInstallmentId: string,
    transaction: Transaction,
  ): Promise<Link | null> {
    const rows = await this.repository.sequelize.query<Link>(
      `SELECT erp_purchase_id, erp_installment_id, core_loan_id
         FROM atlas_sales.core_installment_links
        WHERE core_tenant_id = $1 AND core_installment_id = $2`,
      { bind: [tenantId, coreInstallmentId], type: QueryTypes.SELECT, transaction },
    );
    return rows[0] ?? null;
  }

  private createNotice(
    link: Link,
    installment: BNPLInstallmentModel,
    tenantId: string,
    payload: PaymentReported,
    occurredAt: string,
    transaction: Transaction,
  ): Promise<ConsumerPaymentToMerchantModel> {
    return this.repository.consumerPaymentsToMerchant.create(
      {
        purchaseId: link.erp_purchase_id,
        installmentId: installment.id,
        amount: normalizeAmount(payload.amount),
        paidAt: new Date(occurredAt),
        evidenceRef: `core-claim:${payload.claimCode}`,
        status: PaymentNoticeStatus.REPORTED,
        coreTenantId: tenantId,
        coreClaimId: payload.claimId,
      },
      { transaction },
    );
  }

  private async openLatePaymentReview(
    installment: BNPLInstallmentModel,
    notice: ConsumerPaymentToMerchantModel,
    payload: PaymentConfirmed,
    now: Date,
    transaction: Transaction,
  ): Promise<void> {
    // Una por cuota mientras esté abierta (índice único parcial): varios avisos tardíos de la misma
    // cuota se resuelven juntos.
    await this.repository.sequelize.query(
      `INSERT INTO atlas_sales.coverage_review_items (installment_id, reason, details, opened_at)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (installment_id, reason) WHERE status = 'OPEN' DO NOTHING`,
      {
        bind: [
          installment.id,
          CoverageReviewReason.LATE_PAYMENT_WITH_COVERAGE,
          JSON.stringify({
            source: 'CORE',
            noticeId: notice.id,
            coreClaimId: payload.claimId,
            coreClaimCode: payload.claimCode,
            coreLoanPaymentId: payload.loanPaymentId,
            amount: normalizeAmount(payload.amount),
            installmentStatus: installment.status,
          }),
          now,
        ],
        transaction,
      },
    );
  }

  private async exception(
    envelope: CoreEnvelope,
    reason: ExceptionReason,
    tenantId: string,
    transaction: Transaction,
  ): Promise<CoreEventOutcome> {
    const payload = envelope.payload as Partial<PaymentReported>;
    await this.repository.sequelize.query(
      `INSERT INTO atlas_sales.core_event_exceptions
         (event_key, topic, reason, core_tenant_id, core_installment_id, core_claim_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (event_key) DO NOTHING`,
      {
        bind: [
          envelope.eventKey,
          envelope.topic,
          reason,
          tenantId,
          payload.installmentId ?? null,
          payload.claimId ?? null,
          JSON.stringify(envelope),
        ],
        transaction,
      },
    );
    this.logger.warnContext(CorePaymentEventsService.name, 'Evento de Core sin aplicar', {
      topic: envelope.topic,
      eventKey: envelope.eventKey,
      reason,
    });
    return 'EXCEPTION';
  }
}

function parse(envelope: CoreEnvelope): Parsed {
  if (
    envelope.producer !== 'atlas-core' ||
    envelope.spec !== 'atlas.core.outbox/1' ||
    !envelope.tenantId
  ) {
    throw new UnprocessableEntityException({
      code: 'UNEXPECTED_PRODUCER',
      message: 'Este receptor sólo acepta sobres de Core con tenant.',
    });
  }
  if (!isConsumedCoreTopic(envelope.topic)) {
    throw new UnprocessableEntityException({
      code: 'UNKNOWN_TOPIC',
      message: `El ERP no consume ${envelope.topic}.`,
    });
  }
  const contract = CONSUMED_CORE_TOPICS[envelope.topic];
  if (envelope.schemaVersion !== contract.schemaVersion) {
    throw new UnprocessableEntityException({
      code: 'UNKNOWN_SCHEMA_VERSION',
      message: `${envelope.topic} v${envelope.schemaVersion}: el ERP entiende la v${contract.schemaVersion}.`,
    });
  }
  const result = contract.payload.safeParse(envelope.payload);
  if (!result.success) {
    throw new UnprocessableEntityException({
      code: 'PAYLOAD_CONTRACT_VIOLATION',
      message: `${envelope.topic}: el payload no cumple atlas-integration-v1.`,
      issues: result.error.issues
        .slice(0, 10)
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    });
  }
  return { topic: envelope.topic, payload: result.data } as Parsed;
}
