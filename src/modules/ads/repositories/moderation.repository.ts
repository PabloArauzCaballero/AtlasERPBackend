import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { type Transaction, type WhereOptions } from 'sequelize';
import { PinoLogger } from 'nestjs-pino';
import { createCrudRepository } from '../../../common/persistence/repositories/create-crud-repository';
import { AdModel, CampaignModel, CreativeModel, ModerationReviewModel } from '../models';
import type { ModerationQueueQueryDto } from '../ads.dtos';

@Injectable()
export class ModerationRepository {
  private readonly baseRepository;

  constructor(
    @InjectModel(ModerationReviewModel) private readonly reviewModel: typeof ModerationReviewModel,
    @InjectModel(CampaignModel) private readonly campaignModel: typeof CampaignModel,
    @InjectModel(AdModel) private readonly adModel: typeof AdModel,
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

    if (review.campaignId) {
      await this.campaignModel.update(
        { approvalStatus, status: entityStatus },
        { where: { id: review.campaignId }, transaction },
      );
    }
    if (review.adId) {
      await this.adModel.update(
        { approvalStatus, status: entityStatus },
        { where: { id: review.adId }, transaction },
      );
    }
    if (review.creativeId) {
      await this.creativeModel.update(
        { policyReviewStatus: approvalStatus, status: entityStatus },
        { where: { id: review.creativeId }, transaction },
      );
    }
  }
}
