import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { PinoLogger } from 'nestjs-pino';
import { AdsAuthoringRepository } from '../repositories/authoring.repository';
import { AdvertisersRepository } from '../repositories/advertisers.repository';
import { CampaignsRepository } from '../repositories/campaigns.repository';
import { AdsAuditService } from './audit.service';
import { serializeModel, serializePaginated } from '../ads.mappers';
import type { ActorContext } from '../ads.types';
import type {
  CreateAdDto,
  CreateAdSetDto,
  CreateCampaignDto,
  CreateCreativeDto,
  CreateTargetSegmentDto,
  ListTargetSegmentsQueryDto,
} from '../ads.dtos';

/**
 * Alta de campañas, conjuntos, creatividades, anuncios y segmentos.
 *
 * Todo nace en `DRAFT`/`NOT_SUBMITTED`. Es la regla que sostiene el resto del módulo: el circuito
 * de moderación que ya existía sólo significa algo si nada puede entrar directamente en estado
 * servible.
 *
 * Las comprobaciones de existencia (anunciante, campaña, espacio, segmento, creatividad) se hacen
 * aquí y no se dejan a la llave foránea. Una violación de FK sale como error 500 del driver, sin
 * decir cuál de los cinco identificadores del cuerpo era el malo; con la comprobación explícita,
 * quien integra recibe un 404 que nombra la pieza.
 */
@Injectable()
export class AdsAuthoringService {
  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly authoringRepository: AdsAuthoringRepository,
    private readonly advertisersRepository: AdvertisersRepository,
    private readonly campaignsRepository: CampaignsRepository,
    private readonly auditService: AdsAuditService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AdsAuthoringService.name);
  }

  async createCampaign(input: CreateCampaignDto, actor: ActorContext) {
    return this.sequelize.transaction(async (transaction) => {
      const advertiser = await this.advertisersRepository.findById(input.advertiserId, transaction);
      if (!advertiser) {
        throw new NotFoundException({
          code: 'ADVERTISER_NOT_FOUND',
          message: 'El anunciante no existe.',
        });
      }
      // Un anunciante suspendido, rechazado o bloqueado por riesgo no puede abrir campañas nuevas.
      // La consulta de elegibilidad ya impide que ENTREGUEN, pero dejar crearlas llena el circuito
      // de moderación de trabajo que jamás podrá servirse.
      if (advertiser.status !== 'ACTIVE' || advertiser.riskStatus === 'BLOCKED') {
        throw new ConflictException({
          code: 'ADVERTISER_NOT_ELIGIBLE',
          message: 'El anunciante no está activo o está bloqueado por riesgo.',
        });
      }

      const campaign = await this.authoringRepository.createCampaign(
        input,
        actor.user.sub,
        transaction,
      );
      await this.auditService.record({
        actor,
        entityType: 'CAMPAIGN',
        entityId: campaign.id,
        action: 'CREATE_CAMPAIGN',
        reason: 'Alta de campaña publicitaria.',
        severity: 'MEDIUM',
        after: serializeModel(campaign),
        transaction,
      });
      this.logger.info({ campaignId: campaign.id }, 'Campaign created');
      return serializeModel(campaign);
    });
  }

  async createAdSet(campaignId: string, input: CreateAdSetDto, actor: ActorContext) {
    return this.sequelize.transaction(async (transaction) => {
      const campaign = await this.campaignsRepository.findById(campaignId, transaction);
      if (!campaign) {
        throw new NotFoundException({
          code: 'CAMPAIGN_NOT_FOUND',
          message: 'La campaña no existe.',
        });
      }

      if (input.targetSegmentId) {
        const segment = await this.authoringRepository.findSegmentById(
          input.targetSegmentId,
          transaction,
        );
        if (!segment || segment.status !== 'ACTIVE') {
          throw new NotFoundException({
            code: 'TARGET_SEGMENT_NOT_FOUND',
            message: 'El segmento indicado no existe o está inactivo.',
          });
        }
      }

      // Los espacios se comprueban ANTES de crear el conjunto: un ad set sin espacios válidos no
      // aparece en ninguna consulta de elegibilidad, así que quedaría creado y mudo.
      const existing = await this.authoringRepository.findExistingPlacementIds(
        input.placementIds,
        transaction,
      );
      const missing = input.placementIds.filter((id) => !existing.includes(id));
      if (missing.length > 0) {
        throw new NotFoundException({
          code: 'PLACEMENT_NOT_FOUND',
          message: `Estos espacios no existen: ${missing.join(', ')}.`,
        });
      }

      const adSet = await this.authoringRepository.createAdSet(campaignId, input, transaction);
      await this.authoringRepository.attachPlacements(adSet.id, input.placementIds, transaction);
      await this.auditService.record({
        actor,
        entityType: 'AD_SET',
        entityId: adSet.id,
        action: 'CREATE_AD_SET',
        reason: 'Alta de conjunto de anuncios.',
        severity: 'LOW',
        after: serializeModel(adSet),
        transaction,
      });
      return serializeModel(adSet);
    });
  }

  async createCreative(input: CreateCreativeDto, actor: ActorContext) {
    return this.sequelize.transaction(async (transaction) => {
      const advertiser = await this.advertisersRepository.findById(input.advertiserId, transaction);
      if (!advertiser) {
        throw new NotFoundException({
          code: 'ADVERTISER_NOT_FOUND',
          message: 'El anunciante no existe.',
        });
      }
      const creative = await this.authoringRepository.createCreative(
        input,
        actor.user.sub,
        transaction,
      );
      await this.auditService.record({
        actor,
        entityType: 'CREATIVE',
        entityId: creative.id,
        action: 'CREATE_CREATIVE',
        reason: 'Alta de creatividad publicitaria.',
        severity: 'LOW',
        after: serializeModel(creative),
        transaction,
      });
      return serializeModel(creative);
    });
  }

  async createAd(adSetId: string, input: CreateAdDto, actor: ActorContext) {
    return this.sequelize.transaction(async (transaction) => {
      const adSet = await this.authoringRepository.findAdSetById(adSetId, transaction);
      if (!adSet) {
        throw new NotFoundException({
          code: 'AD_SET_NOT_FOUND',
          message: 'El conjunto de anuncios no existe.',
        });
      }
      const creative = await this.authoringRepository.findCreativeById(
        input.creativeId,
        transaction,
      );
      if (!creative) {
        throw new NotFoundException({
          code: 'CREATIVE_NOT_FOUND',
          message: 'La creatividad no existe.',
        });
      }
      // La creatividad y la campaña tienen que ser del MISMO anunciante. Sin esta comprobación, el
      // anunciante A podría colgar la creatividad del anunciante B de su propio anuncio: la marca
      // ajena entregándose bajo un presupuesto que no es suyo.
      if (adSet.campaign && creative.advertiserId !== adSet.campaign.advertiserId) {
        throw new ConflictException({
          code: 'CREATIVE_ADVERTISER_MISMATCH',
          message: 'La creatividad pertenece a otro anunciante.',
        });
      }

      const ad = await this.authoringRepository.createAd(adSetId, input, transaction);
      await this.auditService.record({
        actor,
        entityType: 'AD',
        entityId: ad.id,
        action: 'CREATE_AD',
        reason: 'Alta de anuncio.',
        severity: 'LOW',
        after: serializeModel(ad),
        transaction,
      });
      return serializeModel(ad);
    });
  }

  async createSegment(input: CreateTargetSegmentDto, actor: ActorContext) {
    return this.sequelize.transaction(async (transaction) => {
      if (input.advertiserId) {
        const advertiser = await this.advertisersRepository.findById(
          input.advertiserId,
          transaction,
        );
        if (!advertiser) {
          throw new NotFoundException({
            code: 'ADVERTISER_NOT_FOUND',
            message: 'El anunciante no existe.',
          });
        }
      }
      const segment = await this.authoringRepository.createSegment(input, transaction);
      await this.auditService.record({
        actor,
        entityType: 'TARGET_SEGMENT',
        entityId: segment.id,
        action: 'CREATE_TARGET_SEGMENT',
        // El detalle importa para auditar: la definición ES la política de a quién se le muestra
        // publicidad, y guardarla en la bitácora permite reconstruir a quién apuntaba una campaña
        // aunque el segmento se edite después.
        reason: `Alta de segmento ${input.segmentType} (${input.privacyLevel}).`,
        severity: 'MEDIUM',
        after: serializeModel(segment),
        transaction,
      });
      return serializeModel(segment);
    });
  }

  async listSegments(query: ListTargetSegmentsQueryDto) {
    return serializePaginated(await this.authoringRepository.listSegments(query));
  }
}
