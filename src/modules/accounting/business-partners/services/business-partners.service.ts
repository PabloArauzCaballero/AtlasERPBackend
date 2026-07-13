import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, WhereOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  BusinessPartnerDefaultAccountModel,
  BusinessPartnerModel,
  BusinessPartnerRoleModel,
} from '../../../../database/models';
import { AuthUser } from '../../../../common/types/auth-context.types';
import { LegalEntityAccessService } from '../../../../common/services/legal-entity-access.service';
import {
  AddBusinessPartnerRoleDto,
  CreateBusinessPartnerDto,
  ListBusinessPartnersQueryDto,
  SetPartnerDefaultAccountDto,
  UpdateBusinessPartnerDto,
} from '../../shared/schemas/accounting.schemas';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

/** Propósitos que se auto-provisionan (como slots) al crear un partner. */
const DEFAULT_PARTNER_ACCOUNT_PURPOSES = [
  'AR_CONTROL',
  'CUSTOMER_ADVANCES',
  'SURCHARGES',
  'WITHHOLDINGS',
  'DISCOUNTS',
] as const;

@Injectable()
export class BusinessPartnersService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly legalEntityAccessService: LegalEntityAccessService,
    private readonly logger: PinoLoggerService,
    @InjectModel(BusinessPartnerModel)
    private readonly businessPartnerModel: typeof BusinessPartnerModel,
    @InjectModel(BusinessPartnerRoleModel)
    private readonly businessPartnerRoleModel: typeof BusinessPartnerRoleModel,
    @InjectModel(BusinessPartnerDefaultAccountModel)
    private readonly defaultAccountModel: typeof BusinessPartnerDefaultAccountModel,
  ) {}

  create(input: CreateBusinessPartnerDto) {
    this.logger.info('Creando Business Partner.', {
      layer: 'service',
      module: 'business-partners',
      action: 'create',
      partnerNo: input.partnerNo,
      partnerType: input.partnerType,
    });
    const { defaultAccounts, ...partnerInput } = input;
    return this.sequelize.transaction(async (transaction) => {
      const partner = await this.businessPartnerModel.create(partnerInput, { transaction });

      // Auto-provisión: cada propósito por defecto queda como slot (cuenta GL a asignar luego),
      // salvo que la creación ya traiga la cuenta explícita en `defaultAccounts`.
      const explicit = new Map<string, string>(
        (defaultAccounts ?? []).map((entry) => [entry.accountPurpose, entry.glAccountId]),
      );
      const purposes = new Set<string>([...DEFAULT_PARTNER_ACCOUNT_PURPOSES, ...explicit.keys()]);
      const rows = [...purposes].map((accountPurpose) => ({
        businessPartnerId: partner.id,
        accountPurpose,
        glAccountId: explicit.get(accountPurpose) ?? null,
      }));
      await this.defaultAccountModel.bulkCreate(rows, { transaction });

      return partner;
    });
  }

  listDefaultAccounts(partnerId: string): Promise<BusinessPartnerDefaultAccountModel[]> {
    return this.defaultAccountModel.findAll({
      where: { businessPartnerId: partnerId } as WhereOptions,
      order: [['accountPurpose', 'ASC']],
    });
  }

  async setDefaultAccount(partnerId: string, input: SetPartnerDefaultAccountDto) {
    await this.get(partnerId);
    this.logger.info('Asignando cuenta por defecto a partner.', {
      layer: 'service',
      module: 'business-partners',
      action: 'setDefaultAccount',
      businessPartnerId: partnerId,
      accountPurpose: input.accountPurpose,
    });
    const [row] = await this.defaultAccountModel.upsert({
      businessPartnerId: partnerId,
      accountPurpose: input.accountPurpose,
      glAccountId: input.glAccountId,
      updatedAt: new Date(),
    });
    return row;
  }

  addRole(input: AddBusinessPartnerRoleDto, user: AuthUser) {
    this.logger.info('Agregando rol a Business Partner.', {
      layer: 'service',
      module: 'business-partners',
      action: 'addRole',
      businessPartnerId: input.businessPartnerId,
      roleCode: input.roleCode,
      legalEntityId: input.legalEntityId,
      userId: user.sub,
    });
    if (input.legalEntityId) {
      this.legalEntityAccessService.assertCanAccessLegalEntity(user, input.legalEntityId);
    }
    return this.businessPartnerRoleModel.create(input);
  }

  list(query: ListBusinessPartnersQueryDto) {
    this.logger.debug('Listando Business Partners.', {
      layer: 'service',
      module: 'business-partners',
      action: 'list',
      page: query.page,
      pageSize: query.pageSize,
    });
    const where: Record<string | symbol, unknown> = {};
    if (query.partnerType) where.partnerType = query.partnerType;
    if (query.kybStatus) where.kybStatus = query.kybStatus;
    if (query.status) where.status = query.status;
    if (query.search) {
      where[Op.or] = [
        { partnerNo: { [Op.iLike]: `%${query.search}%` } },
        { legalName: { [Op.iLike]: `%${query.search}%` } },
        { tradeName: { [Op.iLike]: `%${query.search}%` } },
      ];
    }
    return this.businessPartnerModel.findAndCountAll({
      where: where as WhereOptions,
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
      order: [['createdAt', 'DESC']],
    });
  }

  async get(id: string): Promise<BusinessPartnerModel> {
    const partner = await this.businessPartnerModel.findByPk(id);
    if (!partner) {
      throw new NotFoundException({
        code: 'BUSINESS_PARTNER_NOT_FOUND',
        message: 'El business partner informado no existe.',
      });
    }
    return partner;
  }

  async update(id: string, input: UpdateBusinessPartnerDto): Promise<BusinessPartnerModel> {
    this.logger.info('Actualizando Business Partner.', {
      layer: 'service',
      module: 'business-partners',
      action: 'update',
      businessPartnerId: id,
    });
    const partner = await this.get(id);
    await partner.update({ ...input, updatedAt: new Date() });
    return partner;
  }
}
