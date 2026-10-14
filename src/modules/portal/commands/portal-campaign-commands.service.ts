import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { AdvertiserAccountModel, CampaignModel } from '../../ads/models';
import { AdsAuditService } from '../../ads/services/audit.service';
import { assertCampaignTransition } from '../../ads/ads.campaign-transitions';
import { BusinessActionLogsService } from '../../business-action-logs/business-action-logs.service';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import { PORTAL_MODULE_CODE } from '../portal.constants';
import { toCampaignDto, type PortalCampaignDto } from '../portal.mappers';
import type { PortalActor } from '../portal-actor';
import { PortalScopeService } from '../portal.scope.service';
import type { SetCampaignStatusDto } from '../portal.schemas';
import {
  assertAdvertiserCanDeliver,
  assertCampaignCanResume,
  assertCampaignIsToggleable,
  isCampaignToggleable,
} from './portal-campaign.rules';

/** El encendido y apagado de campañas por el comercio. */
@Injectable()
export class PortalCampaignCommandService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly logger: PinoLoggerService,
    private readonly scopeService: PortalScopeService,
    private readonly adsAuditService: AdsAuditService,
    private readonly businessActionLogs: BusinessActionLogsService,
    @InjectModel(AdvertiserAccountModel)
    private readonly advertiserModel: typeof AdvertiserAccountModel,
    @InjectModel(CampaignModel) private readonly campaignModel: typeof CampaignModel,
  ) {}

  /**
   * Encendido/apagado de una campaña por el comercio.
   *
   * Es la única mutación del portal sobre un agregado facturable de publicidad, así que replica
   * las garantías de la consola administrativa y añade las propias del canal:
   *
   * 1. Propiedad del anunciante (`PortalScopeService`), antes de tocar nada.
   * 2. Anunciante habilitado: `status = ACTIVE` y `risk_status <> BLOCKED`.
   * 3. Solo campañas ya lanzadas (`ACTIVE`/`PAUSED`); el alta y la edición siguen siendo internas.
   * 4. Las invariantes compartidas de transición — en particular, jamás activar sin aprobación
   *    de moderación.
   * 5. Al reactivar: presupuesto no agotado y campaña dentro de su ventana de vigencia.
   * 6. Bloqueo de fila, `ad_audit_log` y bitácora de acciones de negocio en la misma transacción.
   */
  async setCampaignStatus(
    campaignId: string,
    input: SetCampaignStatusDto,
    actor: PortalActor,
  ): Promise<PortalCampaignDto> {
    return this.sequelize.transaction(async (transaction) => {
      const campaign = await this.campaignModel.findByPk(campaignId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!campaign) {
        throw new NotFoundException({
          code: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaña no encontrada.',
        });
      }

      await this.scopeService.assertAdvertiserAccess(
        actor.scope,
        campaign.advertiserId,
        transaction,
      );

      const before = campaign.get({ plain: true }) as Record<string, unknown>;
      const advertiser = await this.advertiserModel.findByPk(campaign.advertiserId, {
        transaction,
      });
      assertAdvertiserCanDeliver(advertiser);
      assertCampaignIsToggleable(campaign);
      assertCampaignTransition(campaign.status, campaign.approvalStatus, input.status);
      if (input.status === 'ACTIVE') assertCampaignCanResume(campaign);

      if (campaign.status === input.status) {
        // Idempotente: el estado deseado ya es el actual, no se genera ruido de auditoría.
        return toCampaignDto(campaign, isCampaignToggleable(campaign));
      }

      await campaign.update({ status: input.status }, { transaction });

      const reason =
        input.reason ??
        `Cambio de estado ${campaign.status} desde el portal del comercio por el usuario ${actor.user.sub}.`;

      const audit = await this.adsAuditService.record({
        actor: { user: actor.user, requestId: actor.requestId },
        actorType: actor.scope.isInternalOperator ? 'INTERNAL_ATLAS_USER' : 'MERCHANT_PORTAL_USER',
        entityType: 'CAMPAIGN',
        entityId: campaign.id,
        action: 'PORTAL_UPDATE_CAMPAIGN_STATUS',
        reason,
        severity: input.status === 'PAUSED' ? 'HIGH' : 'MEDIUM',
        before,
        after: campaign.get({ plain: true }) as Record<string, unknown>,
        transaction,
      });

      await this.businessActionLogs.record({
        moduleCode: PORTAL_MODULE_CODE,
        businessProcess: 'MERCHANT_CAMPAIGN_CONTROL',
        actionCode: 'PORTAL_UPDATE_CAMPAIGN_STATUS',
        actorUserId: actor.user.sub,
        actorRole: actor.user.role ?? null,
        aggregateType: 'CAMPAIGN',
        aggregateId: campaign.id,
        correlationId: campaign.advertiserId,
        requestId: actor.requestId,
        affectedTables: ['ad_campaigns', 'ad_audit_log'],
        affectedRecordCount: 2,
        status: 'SUCCESS',
        inputSummary: {
          from: before.status ?? null,
          to: input.status,
          delegated: actor.scope.isInternalOperator,
        },
        outputSummary: { campaignId: campaign.id, auditId: audit.auditId },
        transaction,
      });

      this.logger.infoContext(
        PortalCampaignCommandService.name,
        'Cambio de estado de campaña desde el portal',
        {
          campaignId: campaign.id,
          advertiserId: campaign.advertiserId,
          from: before.status ?? null,
          to: input.status,
          userId: actor.user.sub,
          requestId: actor.requestId,
          auditId: audit.auditId,
        },
      );

      return toCampaignDto(campaign, isCampaignToggleable(campaign));
    });
  }
}
