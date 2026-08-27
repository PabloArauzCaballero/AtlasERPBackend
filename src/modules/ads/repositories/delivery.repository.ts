import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes, type Transaction } from 'sequelize';
import { PinoLogger } from 'nestjs-pino';
import {
  AdModel,
  AdSetModel,
  AdvertiserAccountModel,
  CampaignModel,
  CreativeModel,
  TargetSegmentModel,
  DeliveryDecisionModel,
  InventoryPlacementModel,
} from '../models';

interface EligibleAdIdRow {
  id: string;
}

interface ContractedTariffRow {
  planId: string;
  planCode: string;
  cpmMicros: string;
  cpcMicros: string;
  currency: string;
}

/** Tarifa vigente del comercio dueño del anunciante, en micros. */
export interface ContractedTariff {
  planId: string;
  planCode: string;
  cpmMicros: number;
  cpcMicros: number;
  currency: string;
}

@Injectable()
export class DeliveryRepository {
  constructor(
    @InjectModel(AdModel) private readonly adModel: typeof AdModel,
    @InjectModel(DeliveryDecisionModel)
    private readonly deliveryDecisionModel: typeof DeliveryDecisionModel,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DeliveryRepository.name);
  }

  async findEligibleAds(
    placement: InventoryPlacementModel,
    now: Date,
    corporateClientHash?: string,
  ): Promise<AdModel[]> {
    this.logger.debug({ placementId: placement.id }, 'Finding eligible ads');
    const rows = await this.adModel.sequelize!.query<EligibleAdIdRow>(
      `SELECT a.id
       FROM ad_ads a
       INNER JOIN ad_ad_sets ad_set ON ad_set.id = a.ad_set_id
       INNER JOIN ad_campaigns campaign ON campaign.id = ad_set.campaign_id
       INNER JOIN ad_advertiser_accounts advertiser ON advertiser.id = campaign.advertiser_id
       INNER JOIN ad_creatives creative ON creative.id = a.creative_id
       INNER JOIN ad_ad_set_placements ad_set_placement ON ad_set_placement.ad_set_id = ad_set.id
       INNER JOIN ad_inventory_placements placement ON placement.id = ad_set_placement.placement_id
       WHERE placement.id = :placementId
         AND placement.is_active = true
         AND advertiser.status = 'ACTIVE'
         AND advertiser.risk_status <> 'BLOCKED'
         AND campaign.status = 'ACTIVE'
         AND campaign.approval_status = 'APPROVED'
         AND campaign.starts_at <= :now
         AND (campaign.ends_at IS NULL OR campaign.ends_at >= :now)
         AND campaign.spend_total_micros < campaign.budget_total_micros
         AND ad_set.status = 'ACTIVE'
         AND (ad_set.starts_at IS NULL OR ad_set.starts_at <= :now)
         AND (ad_set.ends_at IS NULL OR ad_set.ends_at >= :now)
         AND a.status = 'ACTIVE'
         AND a.approval_status = 'APPROVED'
         AND creative.status = 'ACTIVE'
         AND creative.policy_review_status = 'APPROVED'
         AND (
           :corporateClientHash IS NULL
           OR ad_set.frequency_cap_count IS NULL
           OR ad_set.frequency_cap_window_hours IS NULL
           OR (
             SELECT COUNT(*)
             FROM ad_events event
             WHERE event.ad_set_id = ad_set.id
               AND event.event_type = 'IMPRESSION'
               AND event.corporate_client_hash = :corporateClientHash
               AND event.event_time >= (:now::timestamptz - (ad_set.frequency_cap_window_hours || ' hours')::interval)
           ) < ad_set.frequency_cap_count
         )
       ORDER BY (ad_set.bid_amount_micros * GREATEST(a.weight, 1)) DESC
       LIMIT 50`,
      {
        type: QueryTypes.SELECT,
        replacements: {
          placementId: placement.id,
          now: now.toISOString(),
          corporateClientHash: corporateClientHash ?? null,
        },
      },
    );

    const ids = rows.map((row) => row.id);
    if (ids.length === 0) {
      return [];
    }

    return this.adModel.findAll({
      where: { id: { [Op.in]: ids } },
      include: [
        { model: CreativeModel, required: true },
        {
          model: AdSetModel,
          required: true,
          include: [
            {
              model: CampaignModel,
              required: true,
              include: [{ model: AdvertiserAccountModel, required: true }],
            },
            { model: InventoryPlacementModel, required: true, where: { id: placement.id } },
            // El segmento viaja con el candidato para que la evaluación de audiencia ocurra en
            // memoria, sobre un conjunto ya acotado, en vez de traducir la gramática de reglas a
            // SQL. `required: false` es deliberado: un conjunto SIN segmento entrega a todos, y
            // un INNER JOIN aquí lo dejaría fuera — que es el error contrario, y silencioso.
            { model: TargetSegmentModel, required: false },
          ],
        },
      ],
    });
  }

  /**
   * Tarifa que el comercio tiene contratada, si es que la tiene.
   *
   * Va en SQL y no por modelos porque cruza dos mundos —`ad_advertiser_accounts` vive en el
   * esquema público y los planes en `atlas_sales`—, y arrastrar los modelos de ventas al módulo
   * de publicidad para leer dos columnas acoplaría los dos módulos por el arranque.
   *
   * Devuelve `null` cuando el anunciante no cuelga de un comercio o cuando ese comercio no tiene
   * suscripción activa: en ese caso el cobro sigue siendo el de siempre (puja contra precio suelo),
   * porque un anunciante sin plan no tiene tarifa que aplicar.
   */
  async findContractedTariff(advertiserId: string): Promise<ContractedTariff | null> {
    const [row] = await this.deliveryDecisionModel.sequelize!.query<ContractedTariffRow>(
      `SELECT plan.id AS "planId",
              plan.code AS "planCode",
              plan.cpm_micros::text AS "cpmMicros",
              plan.cpc_micros::text AS "cpcMicros",
              plan.currency AS "currency"
       FROM ad_advertiser_accounts advertiser
       INNER JOIN atlas_sales.merchant_subscriptions subscription
         ON subscription.merchant_account_id = advertiser.merchant_account_id
        AND subscription.status = 'ACTIVE'
       INNER JOIN atlas_sales.merchant_plans plan
         ON plan.id = subscription.plan_id
        AND plan.status = 'ACTIVE'
       WHERE advertiser.id = :advertiserId
         AND advertiser.merchant_account_id IS NOT NULL
       LIMIT 1`,
      { type: QueryTypes.SELECT, replacements: { advertiserId } },
    );

    if (!row) return null;
    return {
      planId: row.planId,
      planCode: row.planCode,
      cpmMicros: Number(row.cpmMicros),
      cpcMicros: Number(row.cpcMicros),
      currency: row.currency,
    };
  }

  createDecision(
    values: Partial<DeliveryDecisionModel>,
    transaction?: Transaction,
  ): Promise<DeliveryDecisionModel> {
    return this.deliveryDecisionModel.create(values, { transaction });
  }
}
