import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, type Transaction, type WhereOptions } from 'sequelize';
import { PinoLogger } from 'nestjs-pino';
import { createCrudRepository } from '../../../common/persistence/repositories/create-crud-repository';
import {
  AdModel,
  AdSetModel,
  AdSetPlacementModel,
  CampaignModel,
  CreativeModel,
  InventoryPlacementModel,
  TargetSegmentModel,
} from '../models';
import type {
  CreateAdDto,
  CreateAdSetDto,
  CreateCampaignDto,
  CreateCreativeDto,
  CreateTargetSegmentDto,
  ListTargetSegmentsQueryDto,
} from '../ads.dtos';

/**
 * Escrituras del alta publicitaria: campaña, conjunto de anuncios, creatividad, anuncio y
 * segmentos.
 *
 * Vive aparte de `CampaignsRepository` —que es el lado de lectura— porque son responsabilidades
 * con motivos de cambio distintos: aquélla cambia cuando cambia lo que el portal necesita
 * consultar, ésta cuando cambia lo que se puede dar de alta.
 *
 * Ninguna de estas escrituras fija un estado servible. El estado inicial es siempre `DRAFT` con
 * `NOT_SUBMITTED`: quién puede entregar lo decide la moderación, no quien crea.
 */
@Injectable()
export class AdsAuthoringRepository {
  private readonly segmentsRepository;

  constructor(
    @InjectModel(CampaignModel) private readonly campaignModel: typeof CampaignModel,
    @InjectModel(AdSetModel) private readonly adSetModel: typeof AdSetModel,
    @InjectModel(AdSetPlacementModel)
    private readonly adSetPlacementModel: typeof AdSetPlacementModel,
    @InjectModel(CreativeModel) private readonly creativeModel: typeof CreativeModel,
    @InjectModel(AdModel) private readonly adModel: typeof AdModel,
    @InjectModel(TargetSegmentModel) private readonly segmentModel: typeof TargetSegmentModel,
    @InjectModel(InventoryPlacementModel)
    private readonly placementModel: typeof InventoryPlacementModel,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AdsAuthoringRepository.name);
    this.segmentsRepository = createCrudRepository({ model: this.segmentModel, primaryKey: 'id' });
  }

  createCampaign(
    input: CreateCampaignDto,
    createdBy: string | null,
    transaction: Transaction,
  ): Promise<CampaignModel> {
    return this.campaignModel.create(
      {
        advertiserId: input.advertiserId,
        name: input.name,
        objective: input.objective,
        status: 'DRAFT',
        approvalStatus: 'NOT_SUBMITTED',
        currency: input.currency,
        budgetTotalMicros: input.budgetTotalMicros,
        budgetDailyMicros: input.budgetDailyMicros ?? null,
        spendTotalMicros: 0,
        startsAt: new Date(input.startsAt),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        createdBy,
      } as never,
      { transaction },
    );
  }

  createAdSet(
    campaignId: string,
    input: CreateAdSetDto,
    transaction: Transaction,
  ): Promise<AdSetModel> {
    return this.adSetModel.create(
      {
        campaignId,
        targetSegmentId: input.targetSegmentId ?? null,
        name: input.name,
        status: 'DRAFT',
        buyingModel: input.buyingModel,
        bidAmountMicros: input.bidAmountMicros,
        dailyBudgetMicros: input.dailyBudgetMicros ?? null,
        frequencyCapCount: input.frequencyCapCount ?? null,
        frequencyCapWindowHours: input.frequencyCapWindowHours ?? null,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
      } as never,
      { transaction },
    );
  }

  async attachPlacements(
    adSetId: string,
    placementIds: string[],
    transaction: Transaction,
  ): Promise<void> {
    await this.adSetPlacementModel.bulkCreate(
      placementIds.map((placementId) => ({ adSetId, placementId })) as never[],
      { transaction, ignoreDuplicates: true },
    );
  }

  /** Los espacios que EXISTEN de entre los pedidos: la diferencia la reporta el servicio. */
  async findExistingPlacementIds(
    placementIds: string[],
    transaction: Transaction,
  ): Promise<string[]> {
    const rows = await this.placementModel.findAll({
      where: { id: { [Op.in]: placementIds } } as WhereOptions,
      attributes: ['id'],
      transaction,
    });
    return rows.map((row) => row.id);
  }

  createCreative(
    input: CreateCreativeDto,
    createdBy: string | null,
    transaction: Transaction,
  ): Promise<CreativeModel> {
    return this.creativeModel.create(
      {
        advertiserId: input.advertiserId,
        name: input.name,
        creativeType: input.creativeType,
        headline: input.headline ?? null,
        bodyText: input.bodyText ?? null,
        ctaText: input.ctaText ?? null,
        destinationUrl: input.destinationUrl,
        status: 'DRAFT',
        policyReviewStatus: 'NOT_SUBMITTED',
        createdBy,
      } as never,
      { transaction },
    );
  }

  createAd(adSetId: string, input: CreateAdDto, transaction: Transaction): Promise<AdModel> {
    return this.adModel.create(
      {
        adSetId,
        creativeId: input.creativeId,
        name: input.name,
        status: 'DRAFT',
        approvalStatus: 'NOT_SUBMITTED',
        weight: input.weight,
        trackingTemplate: input.trackingTemplate ?? null,
      } as never,
      { transaction },
    );
  }

  findAdSetById(id: string, transaction?: Transaction): Promise<AdSetModel | null> {
    return this.adSetModel.findOne({
      where: { id } as WhereOptions,
      include: [{ model: CampaignModel, required: true }],
      transaction,
    });
  }

  findCreativeById(id: string, transaction?: Transaction): Promise<CreativeModel | null> {
    return this.creativeModel.findOne({ where: { id } as WhereOptions, transaction });
  }

  createSegment(
    input: CreateTargetSegmentDto,
    transaction: Transaction,
  ): Promise<TargetSegmentModel> {
    return this.segmentModel.create(
      {
        advertiserId: input.advertiserId ?? null,
        name: input.name,
        segmentType: input.segmentType,
        definitionJson: input.definition,
        privacyLevel: input.privacyLevel,
        status: 'ACTIVE',
      } as never,
      { transaction },
    );
  }

  findSegmentById(id: string, transaction?: Transaction): Promise<TargetSegmentModel | null> {
    return this.segmentModel.findOne({ where: { id } as WhereOptions, transaction });
  }

  listSegments(query: ListTargetSegmentsQueryDto) {
    const where: WhereOptions = {};
    if (query.advertiserId) where.advertiser_id = query.advertiserId;
    if (query.segmentType) where.segment_type = query.segmentType;
    if (query.status) where.status = query.status;
    return this.segmentsRepository.paginate(where, query.page, query.limit, {
      order: [['created_at', 'DESC']],
    });
  }
}
