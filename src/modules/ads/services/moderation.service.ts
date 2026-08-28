import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { PinoLogger } from 'nestjs-pino';
import { ModerationRepository } from '../repositories/moderation.repository';
import { CampaignsRepository } from '../repositories/campaigns.repository';
import { AdsAuditService } from './audit.service';
import { serializeModel, serializePaginated } from '../ads.mappers';
import type { ActorContext } from '../ads.types';
import type {
  ModerationDecisionDto,
  ModerationQueueQueryDto,
  SubmitCampaignForReviewDto,
} from '../ads.dtos';
import { TERMINAL_CAMPAIGN_STATUSES } from '../ads.campaign-transitions';

@Injectable()
export class AdsModerationService {
  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly moderationRepository: ModerationRepository,
    private readonly campaignsRepository: CampaignsRepository,
    private readonly auditService: AdsAuditService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AdsModerationService.name);
  }

  async listQueue(query: ModerationQueueQueryDto) {
    return serializePaginated(await this.moderationRepository.listQueue(query));
  }

  /**
   * Envía una campaña —y, por defecto, sus anuncios y creatividades— al circuito de moderación.
   *
   * Es la pieza que faltaba entre el alta y la revisión. Sin ella `ad_moderation_reviews` no se
   * llenaba nunca, la cola salía vacía, ninguna campaña alcanzaba `APPROVED` y, como
   * `assertCampaignTransition` exige esa aprobación para pasar a `ACTIVE`, no había entregas ni
   * eventos ni facturación posibles. El tablero de Ads no estaba sin sembrar: estaba sin salida.
   */
  async submitCampaign(campaignId: string, input: SubmitCampaignForReviewDto, actor: ActorContext) {
    return this.sequelize.transaction(async (transaction) => {
      const campaign = await this.campaignsRepository.findById(campaignId, transaction);
      if (!campaign) {
        throw new NotFoundException({
          code: 'CAMPAIGN_NOT_FOUND',
          message: 'La campaña no existe.',
        });
      }
      if ((TERMINAL_CAMPAIGN_STATUSES as readonly string[]).includes(campaign.status)) {
        throw new ConflictException({
          code: 'CAMPAIGN_IS_TERMINAL',
          message: 'Una campaña finalizada o archivada ya no puede enviarse a revisión.',
        });
      }
      if (campaign.approvalStatus === 'PENDING') {
        throw new ConflictException({
          code: 'CAMPAIGN_ALREADY_IN_REVIEW',
          message: 'La campaña ya está en la cola de moderación.',
        });
      }

      const ads = input.includeAds
        ? await this.moderationRepository.findAdsOfCampaign(campaignId, transaction)
        : [];
      // Una campaña sin anuncios se puede revisar, pero no podrá entregarse aunque se apruebe: la
      // consulta de elegibilidad pide anuncio aprobado. Se avisa en vez de dejarlo pasar mudo.
      if (input.includeAds && ads.length === 0) {
        throw new ConflictException({
          code: 'CAMPAIGN_HAS_NO_ADS',
          message:
            'La campaña no tiene anuncios: apruébala y seguirá sin poder entregarse. Crea al menos un anuncio antes de enviarla.',
        });
      }

      const adIds = ads.map((ad) => ad.id);
      const creativeIds = [...new Set(ads.map((ad) => ad.creativeId))];
      const yaPendientes = await this.moderationRepository.findPendingReviews(
        campaignId,
        adIds,
        creativeIds,
        transaction,
      );
      const conRevision = {
        campana: yaPendientes.some((review) => review.campaignId === campaignId),
        anuncios: new Set(yaPendientes.map((review) => review.adId).filter(Boolean)),
        creatividades: new Set(yaPendientes.map((review) => review.creativeId).filter(Boolean)),
      };

      const pendientes: Array<{
        advertiserId: string;
        campaignId?: string | null;
        adId?: string | null;
        creativeId?: string | null;
        notes?: string | null;
      }> = [];
      if (!conRevision.campana) {
        pendientes.push({
          advertiserId: campaign.advertiserId,
          campaignId,
          notes: input.notes ?? null,
        });
      }
      for (const ad of ads) {
        if (!conRevision.anuncios.has(ad.id)) {
          pendientes.push({ advertiserId: campaign.advertiserId, adId: ad.id, campaignId });
        }
      }
      for (const creativeId of creativeIds) {
        if (!conRevision.creatividades.has(creativeId)) {
          pendientes.push({ advertiserId: campaign.advertiserId, creativeId, campaignId });
        }
      }

      const revisiones = await this.moderationRepository.createPendingReviews(
        pendientes,
        transaction,
      );
      await this.moderationRepository.markSubmittedForReview(
        campaignId,
        adIds,
        creativeIds,
        transaction,
      );

      const audit = await this.auditService.record({
        actor,
        entityType: 'CAMPAIGN',
        entityId: campaignId,
        action: 'SUBMIT_CAMPAIGN_FOR_REVIEW',
        reason: input.notes ?? 'Envío de campaña al circuito de moderación.',
        severity: 'MEDIUM',
        before: { approvalStatus: campaign.approvalStatus, status: campaign.status },
        after: { approvalStatus: 'PENDING', status: 'PENDING_REVIEW' },
        transaction,
      });
      this.logger.info(
        { campaignId, reviewsCreated: revisiones.length, auditId: audit.auditId },
        'Campaign submitted for moderation review',
      );
      return {
        campaignId,
        reviewsCreated: revisiones.length,
        reviews: revisiones.map((review) => serializeModel(review)),
        ...audit,
      };
    });
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
