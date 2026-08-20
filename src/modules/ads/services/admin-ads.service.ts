import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { PinoLogger } from 'nestjs-pino';
import { AdvertisersRepository } from '../repositories/advertisers.repository';
import { CampaignsRepository } from '../repositories/campaigns.repository';
import { InventoryRepository } from '../repositories/inventory.repository';
import { PoliciesRepository } from '../repositories/policies.repository';
import { ReportingRepository } from '../repositories/reporting.repository';
import { AdsAuditService } from './audit.service';
import { assertCampaignTransition } from '../ads.campaign-transitions';
import { BusinessActionLogsService } from '../../business-action-logs/business-action-logs.service';
import { serializeModel, serializePaginated, toPlacementResponse } from '../ads.mappers';
import type {
  CampaignPerformanceQueryDto,
  BulkCreateAdvertisersDto,
  CreateAdvertiserDto,
  CreateBillingProfileDto,
  CreateInventoryPlacementDto,
  CreatePolicyRuleDto,
  DashboardQueryDto,
  ListAdvertisersQueryDto,
  ListCampaignsQueryDto,
  ListInventoryQueryDto,
  ListPoliciesQueryDto,
  UpdateAdvertiserStatusDto,
  UpdateCampaignStatusDto,
} from '../ads.dtos';
import type { ActorContext } from '../ads.types';

@Injectable()
export class AdminAdsService {
  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly advertisersRepository: AdvertisersRepository,
    private readonly campaignsRepository: CampaignsRepository,
    private readonly inventoryRepository: InventoryRepository,
    private readonly policiesRepository: PoliciesRepository,
    private readonly reportingRepository: ReportingRepository,
    private readonly auditService: AdsAuditService,
    private readonly businessActionLogsService: BusinessActionLogsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AdminAdsService.name);
  }

  async getDashboard(query: DashboardQueryDto) {
    const row = await this.reportingRepository.getDashboard(query);
    const totalEvents = Number(row.totalEvents);
    const invalidEvents = Number(row.invalidEvents);
    return {
      revenueMicros: Number(row.revenueMicros),
      billableSpendMicros: Number(row.billableSpendMicros),
      activeCampaigns: Number(row.activeCampaigns),
      pendingReviews: Number(row.pendingReviews),
      overdueInvoices: Number(row.overdueInvoices),
      invalidEventRate: totalEvents === 0 ? 0 : invalidEvents / totalEvents,
      alerts: this.buildDashboardAlerts(
        Number(row.pendingReviews),
        Number(row.overdueInvoices),
        invalidEvents,
      ),
    };
  }

  async listAdvertisers(query: ListAdvertisersQueryDto) {
    return serializePaginated(await this.advertisersRepository.list(query));
  }

  async createAdvertiser(input: CreateAdvertiserDto, actor: ActorContext) {
    return this.sequelize.transaction(async (transaction) => {
      await this.advertisersRepository.ensureTaxIsAvailable(
        input.country,
        input.taxId,
        transaction,
      );
      const advertiser = await this.advertisersRepository.create(
        input,
        actor.user.sub,
        transaction,
      );
      const audit = await this.auditService.record({
        actor,
        entityType: 'ADVERTISER',
        entityId: advertiser.id,
        action: 'CREATE_ADVERTISER',
        reason: 'Alta administrativa de anunciante externo.',
        severity: 'MEDIUM',
        after: serializeModel(advertiser),
        transaction,
      });
      await this.businessActionLogsService.record({
        moduleCode: 'ADS',
        businessProcess: 'ADVERTISER_ADMINISTRATION',
        actionCode: 'CREATE_ADVERTISER_WITH_AUDIT',
        actorUserId: actor.user.sub,
        actorRole: actor.user.role ?? null,
        aggregateType: 'ADVERTISER',
        aggregateId: advertiser.id,
        requestId: actor.requestId,
        affectedTables: ['ad_advertiser_accounts', 'ad_audit_log'],
        affectedRecordCount: 2,
        status: 'SUCCESS',
        inputSummary: { country: input.country, billingMode: input.billingMode },
        outputSummary: { advertiserId: advertiser.id, auditId: audit.auditId },
        transaction,
      });
      return { advertiser: serializeModel(advertiser), ...audit };
    });
  }

  async bulkCreateAdvertisers(input: BulkCreateAdvertisersDto, actor: ActorContext) {
    this.logger.info(
      { itemCount: input.items.length, batchExternalId: input.batchExternalId ?? null },
      'Bulk advertiser creation requested',
    );

    return this.sequelize.transaction(async (transaction) => {
      const advertisers: Array<Record<string, unknown>> = [];
      const auditIds: string[] = [];

      for (const item of input.items) {
        await this.advertisersRepository.ensureTaxIsAvailable(
          item.country,
          item.taxId,
          transaction,
        );
        const advertiser = await this.advertisersRepository.create(
          item,
          actor.user.sub,
          transaction,
        );
        const audit = await this.auditService.record({
          actor,
          entityType: 'ADVERTISER',
          entityId: advertiser.id,
          action: 'BULK_CREATE_ADVERTISER',
          reason: 'Alta administrativa bulk de anunciante externo.',
          severity: 'MEDIUM',
          after: serializeModel(advertiser),
          transaction,
        });
        advertisers.push(serializeModel(advertiser));
        auditIds.push(audit.auditId);
      }

      await this.businessActionLogsService.record({
        moduleCode: 'ADS',
        businessProcess: 'ADVERTISER_ADMINISTRATION',
        actionCode: 'BULK_CREATE_ADVERTISERS',
        actorUserId: actor.user.sub,
        actorRole: actor.user.role ?? null,
        aggregateType: 'ADVERTISER_BATCH',
        aggregateId: input.batchExternalId ?? null,
        correlationId: input.batchExternalId ?? null,
        requestId: actor.requestId,
        affectedTables: ['ad_advertiser_accounts', 'ad_audit_log'],
        affectedRecordCount: advertisers.length + auditIds.length,
        status: 'SUCCESS',
        inputSummary: { requestedItems: input.items.length },
        outputSummary: { createdAdvertisers: advertisers.length, auditEntries: auditIds.length },
        transaction,
      });

      return {
        batchExternalId: input.batchExternalId ?? null,
        totalRequested: input.items.length,
        totalCreated: advertisers.length,
        advertisers,
        auditIds,
      };
    });
  }

  /**
   * Vistas, clicks, conversiones y gasto de una campaña.
   *
   * Comprueba primero que la campaña EXISTE: sin eso, un identificador equivocado devolvería una
   * lista vacía, que se lee como «esta campaña no tuvo ni una impresión» — la peor respuesta
   * posible, porque parece un dato y es un error de tecleo.
   */
  async getCampaignPerformance(campaignId: string, query: CampaignPerformanceQueryDto) {
    const campaign = await this.campaignsRepository.findById(campaignId);
    if (!campaign) {
      throw new NotFoundException({
        code: 'CAMPAIGN_NOT_FOUND',
        message: 'La campaña no existe.',
      });
    }
    const rows = await this.reportingRepository.getCampaignPerformance(campaignId, query);
    return {
      campaignId,
      groupBy: query.groupBy,
      items: rows.map((row) => ({
        bucket: row.bucket,
        bucketLabel: row.bucketLabel,
        impressions: Number(row.impressions),
        clicks: Number(row.clicks),
        conversions: Number(row.conversions),
        billableEvents: Number(row.billableEvents),
        spendMicros: Number(row.spendMicros),
      })),
    };
  }

  async createBillingProfile(
    advertiserId: string,
    input: CreateBillingProfileDto,
    actor: ActorContext,
  ) {
    return this.sequelize.transaction(async (transaction) => {
      const advertiser = await this.advertisersRepository.findById(advertiserId, transaction);
      if (!advertiser) {
        throw new NotFoundException({
          code: 'ADVERTISER_NOT_FOUND',
          message: 'El anunciante no existe.',
        });
      }
      const billingProfile = await this.advertisersRepository.createBillingProfile(
        advertiserId,
        input,
        transaction,
      );
      const audit = await this.auditService.record({
        actor,
        entityType: 'BILLING_PROFILE',
        entityId: billingProfile.id,
        action: 'CREATE_BILLING_PROFILE',
        reason: 'Configuración fiscal administrativa del anunciante.',
        severity: 'HIGH',
        after: serializeModel(billingProfile),
        transaction,
      });
      return { billingProfile: serializeModel(billingProfile), ...audit };
    });
  }

  async getAdvertiserDetail(advertiserId: string) {
    const advertiser = await this.advertisersRepository.findById(advertiserId);
    if (!advertiser) {
      throw new NotFoundException({
        code: 'ADVERTISER_NOT_FOUND',
        message: 'El anunciante no existe.',
      });
    }
    return serializeModel(advertiser);
  }

  async updateAdvertiserStatus(
    advertiserId: string,
    input: UpdateAdvertiserStatusDto,
    actor: ActorContext,
  ) {
    return this.sequelize.transaction(async (transaction) => {
      const before = await this.advertisersRepository.findById(advertiserId, transaction);
      if (!before) {
        throw new NotFoundException({
          code: 'ADVERTISER_NOT_FOUND',
          message: 'El anunciante no existe.',
        });
      }
      if (before.status === 'REJECTED' && input.status === 'ACTIVE') {
        throw new ConflictException({
          code: 'INVALID_ADVERTISER_TRANSITION',
          message: 'No se puede activar directamente un anunciante rechazado sin nueva revisión.',
        });
      }
      const updated = await this.advertisersRepository.updateStatus(
        advertiserId,
        { status: input.status, riskStatus: input.riskStatus },
        transaction,
      );
      if (!updated) {
        throw new NotFoundException({
          code: 'ADVERTISER_NOT_FOUND',
          message: 'El anunciante no existe.',
        });
      }
      const audit = await this.auditService.record({
        actor,
        entityType: 'ADVERTISER',
        entityId: advertiserId,
        action: 'UPDATE_ADVERTISER_STATUS',
        reason: input.reason,
        severity:
          input.status === 'SUSPENDED' || input.riskStatus === 'BLOCKED' ? 'HIGH' : 'MEDIUM',
        before: serializeModel(before),
        after: serializeModel(updated),
        transaction,
      });
      return { advertiser: serializeModel(updated), ...audit };
    });
  }

  async listCampaigns(query: ListCampaignsQueryDto) {
    return serializePaginated(await this.campaignsRepository.list(query));
  }

  async getCampaignDetail(campaignId: string) {
    const campaign = await this.campaignsRepository.findById(campaignId);
    if (!campaign) {
      throw new NotFoundException({ code: 'CAMPAIGN_NOT_FOUND', message: 'La campaña no existe.' });
    }
    return serializeModel(campaign);
  }

  async updateCampaignStatus(
    campaignId: string,
    input: UpdateCampaignStatusDto,
    actor: ActorContext,
  ) {
    return this.sequelize.transaction(async (transaction) => {
      const before = await this.campaignsRepository.findById(campaignId, transaction);
      if (!before) {
        throw new NotFoundException({
          code: 'CAMPAIGN_NOT_FOUND',
          message: 'La campaña no existe.',
        });
      }
      this.assertCampaignTransition(before.status, before.approvalStatus, input.status);
      const updated = await this.campaignsRepository.updateStatus(
        campaignId,
        { status: input.status },
        transaction,
      );
      if (!updated) {
        throw new NotFoundException({
          code: 'CAMPAIGN_NOT_FOUND',
          message: 'La campaña no existe.',
        });
      }
      const audit = await this.auditService.record({
        actor,
        entityType: 'CAMPAIGN',
        entityId: campaignId,
        action: 'UPDATE_CAMPAIGN_STATUS',
        reason: input.reason,
        severity: ['PAUSED', 'ENDED', 'REJECTED', 'ARCHIVED'].includes(input.status)
          ? 'HIGH'
          : 'MEDIUM',
        before: serializeModel(before),
        after: serializeModel(updated),
        transaction,
      });
      return { campaign: serializeModel(updated), ...audit };
    });
  }

  async listInventory(query: ListInventoryQueryDto) {
    const result = await this.inventoryRepository.list(query);
    return {
      items: result.items.map((item) => toPlacementResponse(item)),
      meta: result.meta,
    };
  }

  async createInventoryPlacement(input: CreateInventoryPlacementDto, actor: ActorContext) {
    return this.sequelize.transaction(async (transaction) => {
      const placement = await this.inventoryRepository.create(input, transaction);
      const audit = await this.auditService.record({
        actor,
        entityType: 'PLACEMENT',
        entityId: placement.id,
        action: 'CREATE_PLACEMENT',
        reason: 'Alta administrativa de inventario publicitario.',
        severity: 'MEDIUM',
        after: serializeModel(placement),
        transaction,
      });
      return { placement: toPlacementResponse(placement), ...audit };
    });
  }

  async listPolicies(query: ListPoliciesQueryDto) {
    return serializePaginated(await this.policiesRepository.list(query));
  }

  async createPolicyRule(input: CreatePolicyRuleDto, actor: ActorContext) {
    return this.sequelize.transaction(async (transaction) => {
      const policy = await this.policiesRepository.create(input, actor.user.sub, transaction);
      const audit = await this.auditService.record({
        actor,
        entityType: 'POLICY_RULE',
        entityId: policy.id,
        action: 'CREATE_POLICY_RULE',
        reason: 'Alta administrativa de política publicitaria.',
        severity: input.severity,
        after: serializeModel(policy),
        transaction,
      });
      return { policy: serializeModel(policy), ...audit };
    });
  }

  private buildDashboardAlerts(
    pendingReviews: number,
    overdueInvoices: number,
    invalidEvents: number,
  ) {
    const alerts: Array<{ type: string; severity: string; message: string }> = [];
    if (pendingReviews > 0) {
      alerts.push({
        type: 'MODERATION_BACKLOG',
        severity: 'MEDIUM',
        message: `${pendingReviews} revisiones pendientes.`,
      });
    }
    if (overdueInvoices > 0) {
      alerts.push({
        type: 'OVERDUE_INVOICES',
        severity: 'HIGH',
        message: `${overdueInvoices} facturas vencidas.`,
      });
    }
    if (invalidEvents > 0) {
      alerts.push({
        type: 'INVALID_TRAFFIC',
        severity: 'MEDIUM',
        message: `${invalidEvents} eventos marcados como inválidos o sospechosos.`,
      });
    }
    return alerts;
  }

  private assertCampaignTransition(
    currentStatus: string,
    approvalStatus: string,
    nextStatus: string,
  ): void {
    // Regla compartida con el portal del comercio: ver `ads.campaign-transitions.ts`.
    assertCampaignTransition(currentStatus, approvalStatus, nextStatus);
  }
}
