import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import type { Transaction } from 'sequelize';
import { randomUUID } from 'crypto';
import { PinoLogger } from 'nestjs-pino';
import { env } from '../../../config/env';
import { DeliveryRepository } from '../repositories/delivery.repository';
import { InventoryRepository } from '../repositories/inventory.repository';
import { EventsRepository } from '../repositories/events.repository';
import { AdsAuditService } from './audit.service';
import { BusinessActionLogsService } from '../../business-action-logs/business-action-logs.service';
import { serializeModel, serializePaginated } from '../ads.mappers';
import { audienceMatchesSegment, type EvaluableSegment } from '../ads.segmentation';
import { projectMerchantAudience } from '../ads.audience-projection';
import type { ActorContext } from '../ads.types';
import type {
  DeliveryMonitorQueryDto,
  BulkTrackEventsDto,
  DeliveryRequestDto,
  TrackEventDto,
  UpdateBillableStatusDto,
} from '../ads.dtos';
import type { AdEventModel, AdModel } from '../models';

@Injectable()
export class AdsDeliveryService {
  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly deliveryRepository: DeliveryRepository,
    private readonly inventoryRepository: InventoryRepository,
    private readonly eventsRepository: EventsRepository,
    private readonly auditService: AdsAuditService,
    private readonly businessActionLogsService: BusinessActionLogsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AdsDeliveryService.name);
  }

  async selectAd(input: DeliveryRequestDto) {
    if (!env.GLOBAL_ADS_ENABLED) {
      throw new ServiceUnavailableException({
        code: 'ADS_DISABLED',
        message: 'El módulo publicitario está temporalmente desactivado.',
      });
    }
    const placement = await this.inventoryRepository.findActiveByCode(input.placementCode);
    if (!placement) {
      return { adAvailable: false, reason: 'PLACEMENT_NOT_AVAILABLE' };
    }
    const eligibleAds = await this.deliveryRepository.findEligibleAds(
      placement,
      new Date(),
      input.corporateClientHash,
    );
    if (eligibleAds.length === 0) {
      return { adAvailable: false, reason: 'NO_ELIGIBLE_AD' };
    }

    /*
     * Contra QUÉ se evalúan los segmentos.
     *
     * Lo que la plataforma sabe del comercio pisa lo que el llamante declara. La proyección existía
     * escrita y probada desde el principio y no la llamaba nadie: la segmentación se resolvía
     * enteramente contra `input.audience`, es decir contra una afirmación del integrador, que podía
     * declarar el rubro que le conviniera y entrar en los segmentos de ese rubro.
     *
     * Sólo se puede derivar si la petición dice de qué comercio habla. Cuando no lo dice —o dice
     * uno que no existe o está archivado— se sigue evaluando lo declarado, que es exactamente el
     * comportamiento anterior: esto añade una garantía, no un requisito nuevo.
     */
    const audience = await this.resolveAudience(input);

    // La segmentación se aplica DESPUÉS de los filtros duros (estado, fechas, presupuesto, tope de
    // frecuencia) y sobre los candidatos que ya trajo la consulta. Se evalúa aquí y no en SQL
    // porque la gramática de reglas —operadores, listas, rangos— traducida a SQL sería un
    // generador de consultas dinámico sobre JSONB, y este conjunto está acotado a 50 filas.
    const targeted = eligibleAds.filter((ad) =>
      audienceMatchesSegment(
        (ad.adSet?.targetSegment as EvaluableSegment | undefined) ?? null,
        audience,
      ),
    );
    // Se distingue de `NO_ELIGIBLE_AD` a propósito: «no había anuncios» y «los había y ninguno
    // apuntaba a esta audiencia» llevan a conversaciones distintas con el anunciante, y
    // colapsarlas deja la segmentación imposible de depurar desde fuera.
    if (targeted.length === 0) {
      this.logger.debug(
        { placementCode: placement.code, candidates: eligibleAds.length },
        'All eligible ads filtered out by audience segment',
      );
      return { adAvailable: false, reason: 'NO_AUDIENCE_MATCH' };
    }

    const winner = this.pickWinner(targeted);
    if (!winner || !winner.adSet || !winner.creative || !winner.adSet.campaign) {
      return { adAvailable: false, reason: 'NO_ELIGIBLE_AD' };
    }

    const requestId = randomUUID();
    const rank = this.calculateRank(winner);
    /*
     * El precio de esta entrega sale de la TARIFA que el comercio tiene contratada.
     *
     * Antes salía de la puja del conjunto de anuncios contra el precio suelo del espacio, con lo
     * que la pantalla de tarifas prometía «Bs 2,50 el millar» y el motor cobraba otra cosa: el
     * precio que el comercio veía al elegir su plan no tocaba ni una sola línea del cobro. Desde
     * que las tarifas se configuran en el ERP, son ellas las que fijan el precio unitario, y por
     * eso ganan también sobre el precio suelo: rebajarlo en silencio hasta el suelo dejaría el
     * pricing sin efecto, que es justo lo que se venía a arreglar. Cuando queda por debajo del
     * suelo se avisa, para que se corrija donde se decide —en la tarifa— y no aquí.
     *
     * Un anunciante sin comercio detrás, o cuyo comercio no tiene plan activo, sigue cobrándose
     * como siempre: no hay tarifa que aplicarle.
     */
    const buyingModel = winner.adSet.buyingModel;
    const tariff = await this.deliveryRepository.findContractedTariff(
      winner.adSet.campaign.advertiserId,
    );
    const contractedMicros =
      buyingModel === 'CPM'
        ? (tariff?.cpmMicros ?? 0)
        : buyingModel === 'CPC'
          ? (tariff?.cpcMicros ?? 0)
          : 0;
    const floorMicros = Number(placement.pricingFloorCpmMicros);
    if (buyingModel === 'CPM' && contractedMicros > 0 && contractedMicros < floorMicros) {
      this.logger.warn(
        {
          planCode: tariff?.planCode,
          placementCode: placement.code,
          contractedMicros,
          floorMicros,
        },
        'Contracted CPM tariff is below the placement floor price',
      );
    }
    const priceMicros =
      contractedMicros > 0
        ? contractedMicros
        : Math.max(Number(winner.adSet.bidAmountMicros), floorMicros);
    const decision = await this.deliveryRepository.createDecision({
      requestId,
      placementId: placement.id,
      advertiserId: winner.adSet.campaign.advertiserId,
      campaignId: winner.adSet.campaignId,
      adSetId: winner.adSetId,
      adId: winner.id,
      corporateClientHash: input.corporateClientHash ?? null,
      contextHash: input.contextHash ?? null,
      auctionRank: rank.toFixed(4),
      priceMicros,
    });

    this.logger.info(
      { decisionId: decision.id, adId: winner.id, placementCode: placement.code },
      'Ad selected',
    );
    return {
      adAvailable: true,
      requestId,
      deliveryDecisionId: decision.id,
      ad: {
        id: winner.id,
        name: winner.name,
        weight: winner.weight,
        creative: serializeModel(winner.creative),
      },
      tracking: {
        impressionEndpoint: '/api/v1/ads/events',
        clickEndpoint: '/api/v1/ads/events',
      },
    };
  }

  async trackEvent(input: TrackEventDto) {
    return this.sequelize.transaction((transaction) =>
      this.trackEventInTransaction(input, transaction),
    );
  }

  async trackEventsBulk(input: BulkTrackEventsDto) {
    this.logger.info(
      { itemCount: input.items.length, batchExternalId: input.batchExternalId ?? null },
      'Bulk ad event tracking requested',
    );

    return this.sequelize.transaction(async (transaction) => {
      const items = [];
      let ledgerCreatedCount = 0;

      for (const item of input.items) {
        const result = await this.trackEventInTransaction(item, transaction);
        items.push(result);
        if (result.ledgerCreated) ledgerCreatedCount += 1;
      }

      await this.businessActionLogsService.record({
        moduleCode: 'ADS',
        businessProcess: 'AD_DELIVERY_BILLING',
        actionCode: 'BULK_TRACK_AD_EVENTS_WITH_SPEND_LEDGER',
        aggregateType: 'AD_EVENT_BATCH',
        aggregateId: input.batchExternalId ?? null,
        correlationId: input.batchExternalId ?? null,
        affectedTables: ['ad_events', 'ad_spend_ledger', 'ad_campaigns'],
        affectedRecordCount: items.length + ledgerCreatedCount,
        status: 'SUCCESS',
        inputSummary: { requestedItems: input.items.length },
        outputSummary: { trackedEvents: items.length, ledgerCreated: ledgerCreatedCount },
        transaction,
      });

      return {
        batchExternalId: input.batchExternalId ?? null,
        totalRequested: input.items.length,
        totalTracked: items.length,
        ledgerCreatedCount,
        items,
      };
    });
  }

  private async trackEventInTransaction(input: TrackEventDto, transaction: Transaction) {
    const decision = await this.eventsRepository.findDeliveryDecisionOrThrow(
      input.deliveryDecisionId,
      transaction,
    );
    if (!decision.adSet || !decision.campaign) {
      throw new ConflictException({
        code: 'DELIVERY_DECISION_INCOMPLETE',
        message: 'La decisión no tiene datos suficientes para registrar evento.',
      });
    }
    if (decision.campaign.status !== 'ACTIVE') {
      throw new ConflictException({
        code: 'CAMPAIGN_NOT_SERVABLE',
        message: 'No se puede registrar evento facturable para una campaña inactiva.',
      });
    }

    const idempotencyRequestId = input.requestId ?? decision.requestId;
    const existingEvent = await this.eventsRepository.findExistingEvent(
      decision.id,
      input.eventType,
      idempotencyRequestId,
      transaction,
    );
    if (existingEvent) {
      return {
        event: serializeModel(existingEvent),
        ledgerCreated: Boolean(existingEvent.spendLedgerEntry),
        duplicate: true,
      };
    }

    const costMicros = this.calculateEventCost(
      input.eventType,
      decision.adSet.buyingModel,
      Number(decision.priceMicros),
    );
    const fraudScore = input.fraudScore ?? 0;
    const potentiallyBillable =
      costMicros > 0 && fraudScore <= env.ADS_EVENT_FRAUD_SCORE_MAX_BILLABLE;
    const budgetReserved = potentiallyBillable
      ? await this.eventsRepository.reserveCampaignBudget(
          decision.campaignId,
          costMicros,
          transaction,
        )
      : false;
    const isBillable = potentiallyBillable && budgetReserved;
    const billingSkippedReason =
      potentiallyBillable && !budgetReserved ? 'BUDGET_EXHAUSTED' : undefined;
    const metadata = billingSkippedReason
      ? { ...input.metadata, billingSkippedReason }
      : input.metadata;

    // El momento del evento es el que declara quien lo sirvió, no el de su llegada.
    //
    // El contrato acepta `eventTime` desde siempre y hasta ahora lo descartaba en silencio: la fila
    // se escribía con el `now()` por defecto de la base. Con eventos de uno en uno la diferencia es
    // de milisegundos, pero `POST /ads/events/bulk` existe justamente para enviar tráfico en lote:
    // un envío nocturno con la jornada entera aterrizaba TODO en la fecha de ingesta, y como
    // `ad_daily_metrics` se agrega por `event_time::date`, el informe por día del anunciante
    // mostraba una sola barra con todo el mes dentro. El detalle y el agregado coincidían entre sí
    // y los dos estaban mal.
    //
    // Un evento futuro sí se rechaza: adelantarlo mueve el gasto a un periodo que todavía no se ha
    // cerrado y es la forma barata de alterar una factura. Cinco minutos de margen para el desfase
    // de reloj de quien integra.
    const ahora = new Date();
    const eventTime = input.eventTime ? new Date(input.eventTime) : ahora;
    if (eventTime.getTime() > ahora.getTime() + 5 * 60 * 1000) {
      throw new ConflictException({
        code: 'EVENT_TIME_IN_FUTURE',
        message: 'El momento del evento no puede estar en el futuro.',
      });
    }

    const event = await this.eventsRepository.createEvent(
      {
        eventType: input.eventType,
        eventTime,
        requestId: idempotencyRequestId,
        deliveryDecisionId: decision.id,
        advertiserId: decision.advertiserId,
        campaignId: decision.campaignId,
        adSetId: decision.adSetId,
        adId: decision.adId,
        placementId: decision.placementId,
        corporateClientHash: input.corporateClientHash ?? decision.corporateClientHash,
        sessionHash: input.sessionHash ?? null,
        ipHash: input.ipHash ?? null,
        userAgentHash: input.userAgentHash ?? null,
        costMicros,
        isBillable,
        fraudScore: fraudScore.toFixed(4),
        metadata,
      },
      transaction,
    );
    if (isBillable) {
      await this.eventsRepository.createLedgerEntry(
        {
          advertiserId: decision.advertiserId,
          campaignId: decision.campaignId,
          adEventId: event.id,
          entryType: 'CHARGE',
          amountMicros: costMicros,
          currency: decision.campaign.currency,
          reason: `${input.eventType}_${decision.adSet.buyingModel}`,
        },
        transaction,
      );
    }

    // El agregado por día se escribe DESPUÉS del detalle y dentro de la misma transacción: el
    // evento es la verdad y la métrica su resumen, así que nunca puede existir un resumen de algo
    // que no llegó a registrarse.
    await this.eventsRepository.accumulateDailyMetric(
      {
        eventType: input.eventType,
        advertiserId: decision.advertiserId,
        campaignId: decision.campaignId,
        adSetId: decision.adSetId,
        adId: decision.adId,
        placementId: decision.placementId,
        costMicros,
        isBillable,
        eventTime,
      },
      transaction,
    );

    return { event: serializeModel(event), ledgerCreated: isBillable, duplicate: false };
  }

  async getDeliveryMonitor(query: DeliveryMonitorQueryDto) {
    const [events, aggregates] = await Promise.all([
      this.eventsRepository.listEvents(query),
      this.eventsRepository.getDeliveryAggregates(query),
    ]);
    const deliveryRequests = Number(aggregates.deliveryRequests);
    const impressions = Number(aggregates.impressions);
    return {
      kpis: {
        deliveryRequests,
        impressions,
        clicks: Number(aggregates.clicks),
        conversions: Number(aggregates.conversions),
        invalidEvents: Number(aggregates.invalidEvents),
        fillRate: deliveryRequests === 0 ? 0 : impressions / deliveryRequests,
      },
      events: serializePaginated(events),
    };
  }

  async updateBillableStatus(eventId: string, input: UpdateBillableStatusDto, actor: ActorContext) {
    return this.sequelize.transaction(async (transaction) => {
      const event = await this.eventsRepository.findEventById(eventId, transaction);
      if (!event) {
        throw new NotFoundException({
          code: 'AD_EVENT_NOT_FOUND',
          message: 'El evento publicitario no existe.',
        });
      }
      const before = serializeModel(event);
      await this.applyBillableCorrection(event, input.isBillable, input.reason, transaction);
      const audit = await this.auditService.record({
        actor,
        entityType: 'AD_EVENT',
        entityId: eventId,
        action: 'UPDATE_EVENT_BILLABLE_STATUS',
        reason: input.reason,
        severity: 'HIGH',
        before,
        after: serializeModel(event),
        transaction,
      });
      return { event: serializeModel(event), ...audit };
    });
  }

  private async applyBillableCorrection(
    event: AdEventModel,
    nextIsBillable: boolean,
    reason: string,
    transaction: Parameters<EventsRepository['createEvent']>[1],
  ): Promise<void> {
    if (event.isBillable === nextIsBillable) {
      return;
    }

    const costMicros = Number(event.costMicros);
    const currency =
      event.campaign?.currency ?? event.spendLedgerEntry?.currency ?? env.ADS_DEFAULT_CURRENCY;
    if (nextIsBillable) {
      const budgetReserved = await this.eventsRepository.reserveCampaignBudget(
        event.campaignId,
        costMicros,
        transaction,
      );
      if (!budgetReserved) {
        throw new ConflictException({
          code: 'BUDGET_EXHAUSTED',
          message: 'No hay presupuesto disponible para marcar este evento como facturable.',
        });
      }
      await this.eventsRepository.updateEventBillableStatus(event, true, transaction);
      await this.eventsRepository.createLedgerEntry(
        {
          advertiserId: event.advertiserId,
          campaignId: event.campaignId,
          adEventId: event.spendLedgerEntry ? null : event.id,
          entryType: event.spendLedgerEntry ? 'ADJUSTMENT' : 'CHARGE',
          amountMicros: costMicros,
          currency,
          reason,
        },
        transaction,
      );
      return;
    }

    await this.eventsRepository.updateEventBillableStatus(event, false, transaction);
    await this.eventsRepository.releaseCampaignBudget(event.campaignId, costMicros, transaction);
    await this.eventsRepository.createLedgerEntry(
      {
        advertiserId: event.advertiserId,
        campaignId: event.campaignId,
        adEventId: null,
        entryType: 'CREDIT',
        amountMicros: -costMicros,
        currency,
        reason,
      },
      transaction,
    );
  }

  /** Los atributos de segmentación: los derivados de la cuenta encima de los declarados. */
  private async resolveAudience(input: DeliveryRequestDto) {
    if (!input.merchantAccountId) return input.audience;

    const facts = await this.deliveryRepository.findMerchantFacts(input.merchantAccountId);
    if (!facts) {
      this.logger.warn(
        { merchantAccountId: input.merchantAccountId },
        'Delivery request names a merchant account that does not exist or is archived; falling back to declared audience',
      );
      return input.audience;
    }
    return projectMerchantAudience({ facts, ...(input.audience ? { declared: input.audience } : {}) });
  }

  private pickWinner(ads: AdModel[]): AdModel | null {
    if (ads.length === 0) return null;
    return [...ads].sort((a, b) => this.calculateRank(b) - this.calculateRank(a))[0] ?? null;
  }

  private calculateRank(ad: AdModel): number {
    const bid = Number(ad.adSet?.bidAmountMicros ?? 0);
    return bid * Math.max(ad.weight, 1);
  }

  private calculateEventCost(eventType: string, buyingModel: string, priceMicros: number): number {
    if (eventType === 'IMPRESSION' && buyingModel === 'CPM') return Math.ceil(priceMicros / 1000);
    if (eventType === 'CLICK' && buyingModel === 'CPC') return priceMicros;
    if (eventType === 'CONVERSION' && buyingModel === 'CPA') return priceMicros;
    return 0;
  }
}
