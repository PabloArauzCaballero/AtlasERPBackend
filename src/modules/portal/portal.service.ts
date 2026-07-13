import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { WhereOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  B2BAccountModel,
  MerchantBranchModel,
  MerchantInvoiceModel,
  MerchantPlanModel,
  MerchantReceivableModel,
  MerchantSubscriptionModel,
} from '../b2b-sales-crm/models/b2b-sales-crm.models';
import { AdvertiserAccountModel, CampaignModel } from '../ads/models';
import { AuthUser } from '../../common/types/auth-context.types';
import { PinoLoggerService } from '../../common/logging/pino-logger.service';
import { BranchesQueryDto, CreatePlanDto, SubscribeDto } from './portal.schemas';

@Injectable()
export class PortalService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly logger: PinoLoggerService,
    @InjectModel(MerchantPlanModel) private readonly planModel: typeof MerchantPlanModel,
    @InjectModel(MerchantSubscriptionModel)
    private readonly subscriptionModel: typeof MerchantSubscriptionModel,
    @InjectModel(MerchantBranchModel) private readonly branchModel: typeof MerchantBranchModel,
    @InjectModel(B2BAccountModel) private readonly accountModel: typeof B2BAccountModel,
    @InjectModel(MerchantInvoiceModel) private readonly invoiceModel: typeof MerchantInvoiceModel,
    @InjectModel(MerchantReceivableModel)
    private readonly receivableModel: typeof MerchantReceivableModel,
    @InjectModel(AdvertiserAccountModel)
    private readonly advertiserModel: typeof AdvertiserAccountModel,
    @InjectModel(CampaignModel) private readonly campaignModel: typeof CampaignModel,
  ) {}

  listPlans() {
    return this.planModel.findAll({
      where: { status: 'ACTIVE' } as WhereOptions,
      order: [
        ['sortOrder', 'ASC'],
        ['monthlyPrice', 'ASC'],
      ],
    });
  }

  createPlan(input: CreatePlanDto) {
    this.logger.infoContext(PortalService.name, 'Creando plan merchant', { code: input.code });
    return this.planModel.create(input as unknown as Record<string, unknown>);
  }

  getSubscription(merchantAccountId: string) {
    return this.subscriptionModel.findOne({
      where: { merchantAccountId, status: 'ACTIVE' } as WhereOptions,
      include: [{ model: MerchantPlanModel }],
      order: [['startedAt', 'DESC']],
    });
  }

  async subscribe(input: SubscribeDto, user: AuthUser) {
    const account = await this.accountModel.findByPk(input.merchantAccountId);
    if (!account) {
      throw new NotFoundException('Cuenta merchant no encontrada.');
    }
    const plan = await this.planModel.findByPk(input.planId);
    if (!plan || plan.status !== 'ACTIVE') {
      throw new NotFoundException('Plan no encontrado o inactivo.');
    }

    this.logger.infoContext(PortalService.name, 'Selección de plan merchant', {
      merchantAccountId: input.merchantAccountId,
      planId: input.planId,
    });

    return this.sequelize.transaction(async (transaction) => {
      // Cierra cualquier suscripción activa previa (una sola ACTIVE por comercio).
      await this.subscriptionModel.update(
        { status: 'REPLACED' },
        { where: { merchantAccountId: input.merchantAccountId, status: 'ACTIVE' } as WhereOptions, transaction },
      );

      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const subscription = await this.subscriptionModel.create(
        {
          merchantAccountId: input.merchantAccountId,
          planId: input.planId,
          status: 'ACTIVE',
          autoRenew: input.autoRenew,
          startedAt: new Date(),
          currentPeriodEnd: periodEnd,
          selectedByUserId: user?.sub ?? null,
        },
        { transaction },
      );

      return this.subscriptionModel.findByPk(subscription.id, {
        include: [{ model: MerchantPlanModel }],
        transaction,
      });
    });
  }

  listBranches(query: BranchesQueryDto) {
    return this.branchModel.findAll({
      where: { accountId: query.accountId } as WhereOptions,
      order: [['name', 'ASC']],
    });
  }

  /** Panel de consumo/facturación del comercio: suscripción, facturas, cobros y totales. */
  async getBillingPanel(merchantAccountId: string) {
    const [subscription, invoices, receivables] = await Promise.all([
      this.getSubscription(merchantAccountId),
      this.invoiceModel.findAll({
        where: { accountId: merchantAccountId } as WhereOptions,
        order: [['invoiceDate', 'DESC']],
        limit: 100,
      }),
      this.receivableModel.findAll({
        where: { accountId: merchantAccountId } as WhereOptions,
        order: [['issuedAt', 'DESC']],
        limit: 100,
      }),
    ]);

    const invoicedTotal = invoices.reduce((sum, row) => sum + Number(row.totalAmount ?? 0), 0);
    const openTotal = receivables.reduce((sum, row) => sum + Number(row.amountOpen ?? 0), 0);

    return {
      subscription,
      invoices,
      receivables,
      summary: {
        invoiceCount: invoices.length,
        invoicedTotal,
        openReceivableCount: receivables.filter((row) => Number(row.amountOpen ?? 0) > 0).length,
        openTotal,
        monthlyPlanPrice: subscription?.plan ? Number(subscription.plan.monthlyPrice ?? 0) : 0,
        planName: subscription?.plan?.name ?? null,
      },
    };
  }

  // ---- Control acotado de campañas del comercio ----

  listAdvertisers() {
    return this.advertiserModel.findAll({ order: [['tradeName', 'ASC']] });
  }

  listCampaigns(advertiserId: string) {
    return this.campaignModel.findAll({
      where: { advertiserId } as WhereOptions,
      order: [['createdAt', 'DESC']],
    });
  }

  /** El comercio solo puede prender/apagar campañas ya lanzadas (ACTIVE↔PAUSED). */
  async setCampaignStatus(id: string, status: 'ACTIVE' | 'PAUSED') {
    const campaign = await this.campaignModel.findByPk(id);
    if (!campaign) {
      throw new NotFoundException('Campaña no encontrada.');
    }
    if (!['ACTIVE', 'PAUSED'].includes(campaign.status)) {
      throw new BadRequestException({
        code: 'CAMPAIGN_NOT_TOGGLEABLE',
        message: 'Solo se pueden prender/apagar campañas ya lanzadas (activas o pausadas).',
      });
    }
    this.logger.infoContext(PortalService.name, 'Cambio de estado de campaña por comercio', {
      campaignId: id,
      from: campaign.status,
      to: status,
    });
    await campaign.update({ status });
    return campaign;
  }
}
