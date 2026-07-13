import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { PinoLogger } from 'nestjs-pino';
import { ModerationRepository } from '../repositories/moderation.repository';
import { AdsAuditService } from './audit.service';
import { serializeModel, serializePaginated } from '../ads.mappers';
import type { ActorContext } from '../ads.types';
import type { ModerationDecisionDto, ModerationQueueQueryDto } from '../ads.dtos';

@Injectable()
export class AdsModerationService {
  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly moderationRepository: ModerationRepository,
    private readonly auditService: AdsAuditService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AdsModerationService.name);
  }

  async listQueue(query: ModerationQueueQueryDto) {
    return serializePaginated(await this.moderationRepository.listQueue(query));
  }

  async decide(reviewId: string, input: ModerationDecisionDto, actor: ActorContext) {
    return this.sequelize.transaction(async (transaction) => {
      const review = await this.moderationRepository.findReviewById(reviewId, transaction);
      if (!review) {
        throw new NotFoundException({
          code: 'MODERATION_REVIEW_NOT_FOUND',
          message: 'La revisión no existe.',
        });
      }
      if (review.decision !== 'PENDING_REVIEW') {
        throw new ConflictException({
          code: 'MODERATION_REVIEW_ALREADY_DECIDED',
          message:
            'No se puede modificar una revisión ya decidida; se debe crear una nueva revisión.',
        });
      }

      const before = serializeModel(review);
      const updatedReview = await this.moderationRepository.updateReviewDecision(
        review,
        {
          decision: input.reviewStatus,
          reasonCode: input.reasonCode,
          notes: input.notes,
          reviewerUserId: actor.user.sub,
          requiresAdvertiserChanges: input.requiresAdvertiserChanges,
        },
        transaction,
      );
      await this.moderationRepository.applyDecisionToTargets(
        updatedReview,
        input.reviewStatus,
        transaction,
      );
      const audit = await this.auditService.record({
        actor,
        entityType: 'MODERATION_REVIEW',
        entityId: updatedReview.id,
        action: 'DECIDE_MODERATION_REVIEW',
        reason: input.reasonCode,
        severity: input.reviewStatus === 'APPROVED' ? 'MEDIUM' : 'HIGH',
        before,
        after: serializeModel(updatedReview),
        transaction,
      });
      this.logger.info(
        { reviewId, decision: input.reviewStatus, auditId: audit.auditId },
        'Moderation decision registered',
      );
      return { review: serializeModel(updatedReview), ...audit };
    });
  }
}
