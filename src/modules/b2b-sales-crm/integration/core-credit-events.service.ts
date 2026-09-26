/**
 * Consumidor de `credit.decision.recorded` de Core (T-11, plan
 * `_plan-motor-decisiones-tasa-2026-09-25`).
 *
 * Core decide la banda de riesgo de un cliente al evaluar su crédito; el ERP la necesita para que
 * su regla de MDR por banda case en el registro de la compra (`registerPurchase`). Hasta ahora el
 * comercio declaraba `riskTierAtOrigination` en el cuerpo de la petición — le permitía elegir la
 * tarifa que más le convenga. `atlas_sales.customer_risk_tiers` es la única fuente del lado ERP; el
 * comercio deja de tener voto.
 *
 * Reglas:
 *  - Una sola vez por `eventKey` (`consumeOnce`, `ordering: 'every-event'`): el efecto es un UPSERT
 *    condicional, no una suma, así que reintentar un evento YA aplicado es seguro sin necesitar
 *    orden por versión de agregado.
 *  - El UPSERT sólo avanza si `decidedAt` es MÁS NUEVO que el guardado (o no hay fila): un evento
 *    tardío o repetido con una decisión más vieja no retrocede la banda vigente.
 *  - Sin fila para un cliente, sigue sin banda conocida: es honesto, no un error.
 */
import { Injectable } from '@nestjs/common';
import { UnprocessableEntityException } from '@nestjs/common';
import { QueryTypes, type Transaction } from 'sequelize';
import { consumeOnce } from '../../../common/events/event-inbox';
import { sequelizeQueryable } from '../../../common/events/queryable';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';
import {
  CONSUMED_CORE_TOPICS,
  type CoreEnvelope,
  type CreditDecisionRecorded,
} from './core-events.schemas';

export const CORE_CREDIT_CONSUMER = 'core-credit-decisions';

export type CreditEventOutcome = 'DUPLICATE' | 'APPLIED' | 'STALE';

@Injectable()
export class CoreCreditEventsService {
  constructor(
    private readonly repository: B2BSalesCrmRepository,
    private readonly logger: PinoLoggerService,
  ) {}

  async receive(envelope: CoreEnvelope): Promise<{ outcome: CreditEventOutcome }> {
    const payload = parse(envelope);
    return this.repository.transaction(async (transaction) => {
      const tx = sequelizeQueryable(this.repository.sequelize, transaction);
      const result = await consumeOnce(
        tx,
        {
          consumer: CORE_CREDIT_CONSUMER,
          event: {
            eventKey: envelope.eventKey,
            topic: envelope.topic,
            schemaVersion: envelope.schemaVersion,
            aggregate: envelope.aggregate,
          },
          // Efecto es UPSERT condicional por decidedAt, no una suma: cada evento distinto se
          // aplica una vez sin importar el orden de versión del agregado.
          ordering: 'every-event',
        },
        () => this.apply(payload, envelope.eventKey, transaction),
      );
      if (result.status === 'DUPLICATE') return { outcome: 'DUPLICATE' as const };
      this.logger.infoContext(CoreCreditEventsService.name, 'Evento de crédito de Core aplicado', {
        topic: envelope.topic,
        eventKey: envelope.eventKey,
        outcome: result.status === 'APPLIED' ? result.value : 'STALE',
      });
      return result.status === 'APPLIED'
        ? { outcome: result.value }
        : { outcome: 'STALE' as const };
    });
  }

  private async apply(
    payload: CreditDecisionRecorded,
    eventKey: string,
    transaction: Transaction,
  ): Promise<CreditEventOutcome> {
    const rows = await this.repository.sequelize.query<{ customer_id: string }>(
      `INSERT INTO atlas_sales.customer_risk_tiers
         (customer_id, risk_tier, decided_at, application_code, last_event_key, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, now(), now())
       ON CONFLICT (customer_id) DO UPDATE
         SET risk_tier = EXCLUDED.risk_tier,
             decided_at = EXCLUDED.decided_at,
             application_code = EXCLUDED.application_code,
             last_event_key = EXCLUDED.last_event_key,
             updated_at = now()
         WHERE atlas_sales.customer_risk_tiers.decided_at < EXCLUDED.decided_at
       RETURNING customer_id`,
      {
        bind: [
          payload.customerId,
          payload.riskBand,
          new Date(payload.decidedAt),
          payload.applicationCode,
          eventKey,
        ],
        type: QueryTypes.SELECT,
        transaction,
      },
    );
    return rows.length > 0 ? 'APPLIED' : 'STALE';
  }
}

function parse(envelope: CoreEnvelope): CreditDecisionRecorded {
  if (envelope.producer !== 'atlas-core' || envelope.spec !== 'atlas.core.outbox/1') {
    throw new UnprocessableEntityException({
      code: 'UNEXPECTED_PRODUCER',
      message: 'Este receptor sólo acepta sobres de Core.',
    });
  }
  const contract = CONSUMED_CORE_TOPICS['credit.decision.recorded'];
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
  return result.data;
}
