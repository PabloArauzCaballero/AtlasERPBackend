import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { WhereOptions } from 'sequelize';
import {
  B2BContractModel,
  InternalUserModel,
  MerchantReceivableModel,
} from '../models/b2b-sales-crm.models';

/** Listados de referencia para poblar selects del frontend (evita pegar UUID a mano). */
@Injectable()
export class CatalogsService {
  constructor(
    @InjectModel(InternalUserModel) private readonly internalUserModel: typeof InternalUserModel,
    @InjectModel(B2BContractModel) private readonly contractModel: typeof B2BContractModel,
    @InjectModel(MerchantReceivableModel)
    private readonly receivableModel: typeof MerchantReceivableModel,
  ) {}

  listInternalUsers() {
    return this.internalUserModel.findAll({
      where: { isActive: true } as WhereOptions,
      order: [['fullName', 'ASC']],
    });
  }

  listContracts() {
    return this.contractModel.findAll({ order: [['createdAt', 'DESC']] });
  }

  listReceivables(accountId?: string) {
    return this.receivableModel.findAll({
      where: (accountId ? { accountId } : {}) as WhereOptions,
      order: [['issuedAt', 'DESC']],
      limit: 200,
    });
  }
}
