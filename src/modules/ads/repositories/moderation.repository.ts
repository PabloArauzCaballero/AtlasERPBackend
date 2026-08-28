import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, type Transaction, type WhereOptions } from 'sequelize';
import { PinoLogger } from 'nestjs-pino';
import { createCrudRepository } from '../../../common/persistence/repositories/create-crud-repository';
import {
  AdModel,
  AdSetModel,
  CampaignModel,
  CreativeModel,
  ModerationReviewModel,
} from '../models';
import type { ModerationQueueQueryDto } from '../ads.dtos';

@Injectable()
export class ModerationRepository {
  private readonly baseRepository;

  constructor(
    @InjectModel(ModerationReviewModel) private readonly reviewModel: typeof ModerationReviewModel,
    @InjectModel(CampaignModel) private readonly campaignModel: typeof CampaignModel,
    @InjectModel(AdModel) private readonly adModel: typeof AdModel,
    @InjectModel(AdSetModel) private readonly adSetModel: typeof AdSetModel,
    @InjectModel(CreativeModel) private readonly creativeModel: typeof CreativeModel,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ModerationRepository.name);
    this.baseRepository = createCrudRepository({ model: this.reviewModel, primaryKey: 'id' });
  }

  findReviewById(id: string, transaction?: Transaction): Promise<ModerationReviewModel | null> {
    return this.baseRepository.findById(id, {
      transaction,
      include: [
        { model: CampaignModel, required: false },
        { model: AdModel, required: false, include: [{ model: CreativeModel, required: false }] },
        { model: CreativeModel, required: false },
      ],
    });
  }

  listQueue(query: ModerationQueueQueryDto) {
    const where: WhereOptions = { decision: query.status };
    if (query.advertiserId) where.advertiser_id = query.advertiserId;
    if (query.campaignId) where.campaign_id = query.campaignId;
    return this.baseRepository.paginate(where, query.page, query.limit, {
      order: [['reviewed_at', 'ASC']],
      include: [
        { model: CampaignModel, required: false },
        { model: AdModel, required: false, include: [{ model: CreativeModel, required: false }] },
        { model: CreativeModel, required: false },
      ],
    });
  }

  /**
   * Anuncios de una campaña, con su creatividad. Se recorre por conjunto porque el anuncio no
   * guarda la campaña: cuelga del ad set, que sí la guarda.
   */
  async findAdsOfCampaign(campaignId: string, transaction?: Transaction): Promise<AdModel[]> {
    return this.adModel.findAll({
      transaction,
      include: [
        { model: AdSetModel, required: true, where: { campaign_id: campaignId } },
        { model: CreativeModel, required: false },
      ],
    });
  }

  /**
   * Revisiones ya pendientes para estos objetivos. Reenviar una campaña que ya está en cola no
   * debe duplicar la fila: el moderador vería dos veces la misma pieza y decidir una dejaría a la
   * otra viva, capaz de revertir la decisión al decidirse después.
   */
  async findPendingReviews(
    campaignId: string,
    adIds: string[],
    creativeIds: string[],
    transaction?: Transaction,
  ): Promise<ModerationReviewModel[]> {
    return this.reviewModel.findAll({
      transaction,
      where: {
        decision: 'PENDING_REVIEW',
        [Op.or]: [
          { campaign_id: campaignId },
          ...(adIds.length > 0 ? [{ ad_id: { [Op.in]: adIds } }] : []),
          ...(creativeIds.length > 0 ? [{ creative_id: { [Op.in]: creativeIds } }] : []),
        ],
      },
    });
  }

  async createPendingReviews(
    rows: Array<{
      advertiserId: string;
      campaignId?: string | null;
      adId?: string | null;
      creativeId?: string | null;
      notes?: string | null;
    }>,
    transaction?: Transaction,
  ): Promise<ModerationReviewModel[]> {
    return this.reviewModel.bulkCreate(
      rows.map((row) => ({
        advertiserId: row.advertiserId,
        campaignId: row.campaignId ?? null,
        adId: row.adId ?? null,
        creativeId: row.creativeId ?? null,
        decision: 'PENDING_REVIEW',
        notes: row.notes ?? null,
        requiresAdvertiserChanges: false,
      })),
      { transaction, returning: true },
    );
  }

  /**
   * Marca lo enviado como pendiente. `PENDING` en la aprobación y `PENDING_REVIEW` en el estado
   * son los mismos valores que deja una decisión de moderación, para que la pieza no aparezca como
   * borrador editable mientras alguien la está revisando.
   */
  async markSubmittedForReview(
    campaignId: string,
    adIds: string[],
    creativeIds: string[],
    transaction?: Transaction,
  ): Promise<void> {
    await this.campaignModel.update(
      { approvalStatus: 'PENDING', status: 'PENDING_REVIEW' },
      { where: { id: campaignId }, transaction },
    );
    if (adIds.length > 0) {
      await this.adModel.update(
        { approvalStatus: 'PENDING', status: 'PENDING_REVIEW' },
        { where: { id: { [Op.in]: adIds } }, transaction },
      );
    }
    if (creativeIds.length > 0) {
      await this.creativeModel.update(
        { policyReviewStatus: 'PENDING', status: 'PENDING_REVIEW' },
        { where: { id: { [Op.in]: creativeIds } }, transaction },
      );
    }
  }

  async updateReviewDecision(
    review: ModerationReviewModel,
    values: {
      decision: string;
      reasonCode: string;
      notes?: string;
      reviewerUserId: string;
      requiresAdvertiserChanges: boolean;
    },
    transaction?: Transaction,
  ): Promise<ModerationReviewModel> {
    await review.update(
      {
        decision: values.decision,
        reasonCode: values.reasonCode,
        notes: values.notes ?? null,
        reviewerUserId: values.reviewerUserId,
        requiresAdvertiserChanges: values.requiresAdvertiserChanges,
      },
      { transaction },
    );
    return review;
  }

  async applyDecisionToTargets(
    review: ModerationReviewModel,
    decision: string,
    transaction?: Transaction,
  ): Promise<void> {
    const approvalStatus =
      decision === 'APPROVED'
        ? 'APPROVED'
        : decision === 'REJECTED'
          ? 'REJECTED'
          : 'CHANGES_REQUESTED';
    const entityStatus =
      decision === 'APPROVED'
        ? 'APPROVED'
        : decision === 'REJECTED'
          ? 'REJECTED'
          : 'PENDING_REVIEW';

    // La campaña aprobada NO se activa sola: queda en `APPROVED` y activarla sigue siendo un acto
    // explícito de quien la gestiona (`PATCH /campaigns/:id/status`). Es el único freno humano que
    // queda entre aprobar y gastar presupuesto.
    if (review.campaignId) {
      await this.campaignModel.update(
        { approvalStatus, status: entityStatus },
        { where: { id: review.campaignId }, transaction },
      );
    }
    // El anuncio y la creatividad sí quedan servibles. No tienen ciclo de vida propio —no existe
    // endpoint que los pase a `ACTIVE`— y la consulta de elegibilidad de entrega exige
    // `ad.status = ACTIVE` y `creative.status = ACTIVE`. Dejarlos en `APPROVED`, como se hacía,
    // significaba que una campaña podía aprobarse, activarse y aun así no entregar nada: el
    // anuncio nunca alcanzaba un estado servible por ninguna vía del producto. Que estén activos
    // no los entrega por su cuenta: la campaña que los contiene sigue siendo la compuerta.
    const servibleTrasAprobar = decision === 'APPROVED' ? 'ACTIVE' : entityStatus;
    if (review.adId) {
      await this.adModel.update(
        { approvalStatus, status: servibleTrasAprobar },
        { where: { id: review.adId }, transaction },
      );
      // El conjunto de anuncios tampoco tiene revisión ni endpoint de estado, y la elegibilidad
      // también le exige `ACTIVE`. Se activa con su anuncio porque no es contenido que moderar:
      // es el contenedor de segmentación y presupuesto del que cuelga.
      if (decision === 'APPROVED') {
        const ad = await this.adModel.findByPk(review.adId, { transaction });
        if (ad) {
          await this.adSetModel.update(
            { status: 'ACTIVE' },
            { where: { id: ad.adSetId }, transaction },
          );
        }
      }
    }
    if (review.creativeId) {
      await this.creativeModel.update(
        { policyReviewStatus: approvalStatus, status: servibleTrasAprobar },
        { where: { id: review.creativeId }, transaction },
      );
    }
  }
}
