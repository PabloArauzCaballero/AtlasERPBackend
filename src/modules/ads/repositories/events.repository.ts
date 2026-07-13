import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes, type Transaction, type WhereOptions } from 'sequelize';
import { PinoLogger } from 'nestjs-pino';
import { createCrudRepository } from '../../../common/persistence/repositories/create-crud-repository';
import {
  AdEventModel,
  AdModel,
  AdSetModel,
  AdvertiserAccountModel,
  CampaignModel,
  CreativeModel,
  DeliveryDecisionModel,
  InventoryPlacementModel,
  SpendLedgerModel,
} from '../models';
import type { DeliveryMonitorQueryDto } from '../ads.dtos';

interface DeliveryAggregateRow {
  deliveryRequests: string;
  impressions: string;
  clicks: string;
  conversions: string;
  invalidEvents: string;
}

interface UpdatedCampaignRow {
  id: string;
}

@Injectable()
export class EventsRepository {
  private readonly eventsBaseRepository;

  constructor(
    @InjectModel(DeliveryDecisionModel)
    private readonly deliveryDecisionModel: typeof DeliveryDecisionModel,
    @InjectModel(AdEventModel) private readonly eventModel: typeof AdEventModel,
    @InjectModel(SpendLedgerModel) private readonly ledgerModel: typeof SpendLedgerModel,
    @InjectModel(CampaignModel) private readonly campaignModel: typeof CampaignModel,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EventsRepository.name);
    this.eventsBaseRepository = createCrudRepository({ model: this.eventModel, primaryKey: 'id' });
  }

  async findDeliveryDecisionOrThrow(
    id: string,
    transaction?: Transaction,
  ): Promise<DeliveryDecisionModel> {
    const decision = await this.deliveryDecisionModel.findByPk(id, {
      transaction,
      include: [
        InventoryPlacementModel,
        AdvertiserAccountModel,
        CampaignModel,
        { model: AdSetModel, required: true },
        { model: AdModel, required: true, include: [{ model: CreativeModel, required: true }] },
      ],
    });
    if (!decision) {
      throw new NotFoundException({
        code: 'DELIVERY_DECISION_NOT_FOUND',
        message: 'La decisión de delivery no existe.',
      });
    }
    return decision;
  }

  findExistingEvent(
    deliveryDecisionId: string,
    eventType: string,
    requestId: string | null,
    transaction?: Transaction,
  ): Promise<AdEventModel | null> {
    if (!requestId) {
      return Promise.resolve(null);
    }
    return this.eventModel.findOne({
      where: { deliveryDecisionId, eventType, requestId },
      include: [{ model: SpendLedgerModel, required: false }],
      transaction,
    });
  }

  createEvent(values: Partial<AdEventModel>, transaction?: Transaction): Promise<AdEventModel> {
    this.logger.debug({ eventType: values.eventType, adId: values.adId }, 'Creating ad event');
    return this.eventModel.create(values, { transaction });
  }

  updateEventBillableStatus(
    event: AdEventModel,
    isBillable: boolean,
    transaction?: Transaction,
  ): Promise<AdEventModel> {
    return event.update({ isBillable }, { transaction });
  }

  createLedgerEntry(
    values: Partial<SpendLedgerModel>,
    transaction?: Transaction,
  ): Promise<SpendLedgerModel> {
    return this.ledgerModel.create(values, { transaction });
  }

  async reserveCampaignBudget(
    campaignId: string,
    amountMicros: number,
    transaction?: Transaction,
  ): Promise<boolean> {
    if (amountMicros <= 0) return true;
    const rows = await this.campaignModel.sequelize!.query<UpdatedCampaignRow>(
      `UPDATE ad_campaigns
       SET spend_total_micros = spend_total_micros + :amountMicros,
           updated_at = now()
       WHERE id = :campaignId
         AND spend_total_micros + :amountMicros <= budget_total_micros
       RETURNING id`,
      { type: QueryTypes.SELECT, replacements: { campaignId, amountMicros }, transaction },
    );
    return rows.length === 1;
  }

  async releaseCampaignBudget(
    campaignId: string,
    amountMicros: number,
    transaction?: Transaction,
  ): Promise<void> {
    if (amountMicros <= 0) return;
    await this.campaignModel.sequelize!.query(
      `UPDATE ad_campaigns
       SET spend_total_micros = GREATEST(spend_total_micros - :amountMicros, 0),
           updated_at = now()
       WHERE id = :campaignId`,
      { replacements: { campaignId, amountMicros }, transaction },
    );
  }

  listEvents(query: DeliveryMonitorQueryDto) {
    const where: WhereOptions = {};
    if (query.placementId) where.placement_id = query.placementId;
    if (query.status === 'BILLABLE') where.is_billable = true;
    if (query.status === 'NON_BILLABLE') where.is_billable = false;
    if (query.status === 'SUSPICIOUS') where.fraud_score = { [Op.gte]: 0.8 };
    if (query.from || query.to) {
      where.event_time = {
        ...(query.from ? { [Op.gte]: new Date(`${query.from}T00:00:00.000Z`) } : {}),
        ...(query.to ? { [Op.lte]: new Date(`${query.to}T23:59:59.999Z`) } : {}),
      };
    }
    return this.eventsBaseRepository.paginate(where, query.page, query.limit, {
      order: [['event_time', 'DESC']],
    });
  }

  async getDeliveryAggregates(query: DeliveryMonitorQueryDto): Promise<DeliveryAggregateRow> {
    const rows = await this.eventModel.sequelize!.query<DeliveryAggregateRow>(
      `SELECT
         (SELECT COUNT(*)::text FROM ad_delivery_decisions dd WHERE (:placementId IS NULL OR dd.placement_id = :placementId)) AS "deliveryRequests",
         COUNT(*) FILTER (WHERE event_type = 'IMPRESSION')::text AS impressions,
         COUNT(*) FILTER (WHERE event_type = 'CLICK')::text AS clicks,
         COUNT(*) FILTER (WHERE event_type = 'CONVERSION')::text AS conversions,
         COUNT(*) FILTER (WHERE is_billable = false OR fraud_score >= 0.8)::text AS "invalidEvents"
       FROM ad_events
       WHERE (:placementId IS NULL OR placement_id = :placementId)
         AND (:fromDate IS NULL OR event_time >= :fromDate)
         AND (:toDate IS NULL OR event_time <= :toDate)`,
      {
        type: QueryTypes.SELECT,
        replacements: {
          placementId: query.placementId ?? null,
          fromDate: query.from ? `${query.from}T00:00:00.000Z` : null,
          toDate: query.to ? `${query.to}T23:59:59.999Z` : null,
        },
      },
    );
    return (
      rows[0] ?? {
        deliveryRequests: '0',
        impressions: '0',
        clicks: '0',
        conversions: '0',
        invalidEvents: '0',
      }
    );
  }

  findEventById(id: string, transaction?: Transaction): Promise<AdEventModel | null> {
    return this.eventsBaseRepository.findById(id, {
      include: [
        { model: SpendLedgerModel, required: false },
        { model: CampaignModel, required: false },
      ],
      transaction,
    });
  }
}
