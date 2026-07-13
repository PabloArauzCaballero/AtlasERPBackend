import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, type Transaction, type WhereOptions } from 'sequelize';
import { PinoLogger } from 'nestjs-pino';
import { createCrudRepository } from '../../../common/persistence/repositories/create-crud-repository';
import {
  AdvertiserAccountModel,
  BillingProfileModel,
  CampaignModel,
  InvoiceModel,
} from '../models';
import type {
  CreateAdvertiserDto,
  CreateBillingProfileDto,
  ListAdvertisersQueryDto,
} from '../ads.dtos';

@Injectable()
export class AdvertisersRepository {
  private readonly baseRepository;

  constructor(
    @InjectModel(AdvertiserAccountModel)
    private readonly advertiserModel: typeof AdvertiserAccountModel,
    @InjectModel(BillingProfileModel)
    private readonly billingProfileModel: typeof BillingProfileModel,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AdvertisersRepository.name);
    this.baseRepository = createCrudRepository({ model: this.advertiserModel, primaryKey: 'id' });
  }

  async ensureTaxIsAvailable(
    countryCode: string,
    taxId: string,
    transaction?: Transaction,
  ): Promise<void> {
    const existing = await this.advertiserModel.findOne({
      where: { countryCode, taxId },
      transaction,
    });
    if (existing) {
      throw new ConflictException({
        code: 'ADVERTISER_TAX_ID_ALREADY_EXISTS',
        message: 'Ya existe un anunciante con ese NIT/tax ID en el país indicado.',
      });
    }
  }

  create(
    input: CreateAdvertiserDto,
    actorId: string,
    transaction?: Transaction,
  ): Promise<AdvertiserAccountModel> {
    this.logger.info({ country: input.country, actorId }, 'Creating advertiser account');
    return this.advertiserModel.create(
      {
        legalName: input.legalName,
        tradeName: input.tradeName,
        taxId: input.taxId,
        countryCode: input.country,
        city: input.city ?? null,
        businessCategory: input.businessCategory ?? null,
        websiteUrl: input.websiteUrl ?? null,
        primaryContactName: input.primaryContactName ?? null,
        primaryContactEmail: input.primaryContactEmail ?? null,
        billingMode: input.billingMode,
        currency: input.currency,
        creditLimitMicros: input.creditLimitMicros,
        status: 'PENDING_REVIEW',
        riskStatus: 'NORMAL',
        createdBy: actorId,
      },
      { transaction },
    );
  }

  findById(id: string, transaction?: Transaction): Promise<AdvertiserAccountModel | null> {
    return this.baseRepository.findById(id, {
      transaction,
      include: [
        { model: BillingProfileModel, required: false },
        { model: CampaignModel, required: false, limit: 10, order: [['created_at', 'DESC']] },
        { model: InvoiceModel, required: false, limit: 10, order: [['created_at', 'DESC']] },
      ],
    });
  }

  list(query: ListAdvertisersQueryDto) {
    const where: WhereOptions = {};
    if (query.status) where.status = query.status;
    if (query.riskStatus) where.risk_status = query.riskStatus;
    if (query.billingMode) where.billing_mode = query.billingMode;
    if (query.search) {
      Object.assign(where, {
        [Op.or]: [
          { legalName: { [Op.iLike]: `%${query.search}%` } },
          { tradeName: { [Op.iLike]: `%${query.search}%` } },
          { taxId: { [Op.iLike]: `%${query.search}%` } },
        ],
      });
    }
    return this.baseRepository.paginate(where, query.page, query.limit, {
      order: [['created_at', 'DESC']],
    });
  }

  updateStatus(
    id: string,
    values: { status: string; riskStatus?: string },
    transaction?: Transaction,
  ) {
    return this.baseRepository.updateById(id, values, { transaction });
  }

  async createBillingProfile(
    advertiserId: string,
    input: CreateBillingProfileDto,
    transaction?: Transaction,
  ): Promise<BillingProfileModel> {
    if (input.isDefault) {
      await this.billingProfileModel.update(
        { isDefault: false },
        { where: { advertiserId, status: 'ACTIVE' }, transaction },
      );
    }

    return this.billingProfileModel.create(
      {
        advertiserId,
        fiscalName: input.fiscalName,
        taxId: input.taxId,
        billingEmail: input.billingEmail,
        addressLine: input.addressLine ?? null,
        countryCode: input.country,
        city: input.city ?? null,
        taxRegime: input.taxRegime ?? null,
        sinCustomerCode: input.sinCustomerCode ?? null,
        isDefault: input.isDefault,
        status: 'ACTIVE',
      },
      { transaction },
    );
  }
}
