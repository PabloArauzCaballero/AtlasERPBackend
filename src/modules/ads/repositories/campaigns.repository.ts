import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, type Transaction, type WhereOptions } from 'sequelize';
import { PinoLogger } from 'nestjs-pino';
import { createCrudRepository } from '../../../common/persistence/repositories/create-crud-repository';
import {
  AdModel,
  AdSetModel,
  AdvertiserAccountModel,
  CampaignModel,
  CreativeModel,
} from '../models';
import type { ListCampaignsQueryDto } from '../ads.dtos';

@Injectable()
export class CampaignsRepository {
  private readonly baseRepository;

  constructor(
    @InjectModel(CampaignModel) private readonly campaignModel: typeof CampaignModel,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CampaignsRepository.name);
    this.baseRepository = createCrudRepository({ model: this.campaignModel, primaryKey: 'id' });
  }

  findById(id: string, transaction?: Transaction): Promise<CampaignModel | null> {
    return this.baseRepository.findById(id, {
      transaction,
      include: [
        { model: AdvertiserAccountModel, required: true },
        {
          model: AdSetModel,
          required: false,
          include: [
            {
              model: AdModel,
              required: false,
              include: [{ model: CreativeModel, required: false }],
            },
          ],
        },
      ],
    });
  }

  list(query: ListCampaignsQueryDto) {
    const where: WhereOptions = {};
    if (query.advertiserId) where.advertiser_id = query.advertiserId;
    if (query.status) where.status = query.status;
    if (query.approvalStatus) where.approval_status = query.approvalStatus;
    if (query.from || query.to) {
      where.starts_at = {
        ...(query.from ? { [Op.gte]: new Date(`${query.from}T00:00:00.000Z`) } : {}),
        ...(query.to ? { [Op.lte]: new Date(`${query.to}T23:59:59.999Z`) } : {}),
      };
    }
    return this.baseRepository.paginate(where, query.page, query.limit, {
      order: [['created_at', 'DESC']],
      include: [{ model: AdvertiserAccountModel, required: true }],
    });
  }

  updateStatus(
    id: string,
    values: { status: string; approvalStatus?: string },
    transaction?: Transaction,
  ): Promise<CampaignModel | null> {
    this.logger.info({ campaignId: id, status: values.status }, 'Updating campaign status');
    return this.baseRepository.updateById(id, values, { transaction });
  }

  incrementSpend(id: string, amountMicros: number, transaction?: Transaction): Promise<unknown> {
    return this.campaignModel.increment(
      { spendTotalMicros: amountMicros },
      { where: { id }, transaction },
    );
  }
}
