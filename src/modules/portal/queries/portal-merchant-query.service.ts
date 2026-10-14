import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import {
  B2BAccountModel,
  MerchantBranchModel,
} from '../../b2b-sales-crm/models/b2b-sales-crm.models';
import { AdvertiserAccountModel, CampaignModel } from '../../ads/models';
import { isCampaignToggleable } from '../commands/portal-campaign.rules';
import { PORTAL_SCOPE_ACCOUNT_LIMIT } from '../portal.constants';
import {
  toAdvertiserDto,
  toBranchDto,
  toCampaignDto,
  type PortalAdvertiserDto,
  type PortalBranchDto,
  type PortalCampaignDto,
} from '../portal.mappers';
import { PortalScopeService, type PortalScope } from '../portal.scope.service';
import type { AdvertisersQueryDto, BranchesQueryDto, CampaignsQueryDto } from '../portal.schemas';

/** Lo que el comercio ve de su propia operación: quién es, sus sucursales, anunciantes y campañas. */
@Injectable()
export class PortalMerchantQueryService {
  constructor(
    private readonly scopeService: PortalScopeService,
    @InjectModel(MerchantBranchModel) private readonly branchModel: typeof MerchantBranchModel,
    @InjectModel(B2BAccountModel) private readonly accountModel: typeof B2BAccountModel,
    @InjectModel(AdvertiserAccountModel)
    private readonly advertiserModel: typeof AdvertiserAccountModel,
    @InjectModel(CampaignModel) private readonly campaignModel: typeof CampaignModel,
  ) {}

  async listBranches(scope: PortalScope, query: BranchesQueryDto): Promise<PortalBranchDto[]> {
    const accountId = this.scopeService.resolveAccountId(scope, query.accountId);
    const branches = await this.branchModel.findAll({
      where: { accountId },
      order: [['name', 'ASC']],
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });

    return branches.map((branch) => toBranchDto(branch));
  }

  /**
   * Sobre qué comercios puede operar quien está mirando, contestado por el SERVIDOR.
   *
   * Existe porque el portal no puede seguir adivinándolo. El navegador decidía si era «comercio»
   * a partir de un valor que él mismo se guardó al entrar (`sessionKind`), mientras el backend lo
   * decide por los roles del token. Cuando los dos no coinciden —y con
   * `AUTH_DISABLED_FOR_LOCAL_TESTING=true` NUNCA coinciden, porque ahí toda petición llega como
   * ADMIN— la pantalla quedaba en un callejón sin salida: se creía comercio, así que no pintaba
   * el selector ni mandaba cuenta, y el backend le exigía la cuenta que la pantalla había
   * decidido no ofrecer. Cuatro pantallas del portal, el mismo muro.
   *
   * La lista NO es «todas las cuentas»: para un comercio son sus membresías y nada más, así que
   * este endpoint es seguro de llamar desde el portal —al contrario que `b2b/accounts`, que es
   * interno y un comercio ni siquiera puede invocar—.
   */
  async getScope(scope: PortalScope) {
    const where = scope.isInternalOperator ? {} : { id: { [Op.in]: scope.accountIds } };
    const accounts = await this.accountModel.findAll({
      where,
      attributes: ['id', 'tradeName', 'legalName'],
      order: [['tradeName', 'ASC']],
      limit: PORTAL_SCOPE_ACCOUNT_LIMIT,
    });

    return {
      isInternalOperator: scope.isInternalOperator,
      /*
       * Que haya que ELEGIR es un dato del servidor, no una deducción de la pantalla.
       *
       * Un comercio con una sola cuenta no elige —el backend la infiere—; con varias, sí. Y el
       * staff interno siempre elige. Mandarlo resuelto evita que cada pantalla repita esa regla
       * y se equivoque de forma distinta.
       */
      requiresAccountSelection: scope.isInternalOperator || scope.accountIds.length > 1,
      accounts: accounts.map((account) => ({
        id: account.id,
        name: account.tradeName || account.legalName,
      })),
    };
  }

  async listAdvertisers(
    scope: PortalScope,
    query: AdvertisersQueryDto,
  ): Promise<PortalAdvertiserDto[]> {
    const advertiserIds = await this.scopeService.resolveAccessibleAdvertiserIds(
      scope,
      query.merchantAccountId,
    );

    // `null` = staff interno sin cuenta indicada: sin filtro de propiedad, con tope de página.
    if (advertiserIds !== null && advertiserIds.length === 0) return [];

    const advertisers = await this.advertiserModel.findAll({
      ...(advertiserIds === null ? {} : { where: { id: { [Op.in]: advertiserIds } } }),
      order: [['tradeName', 'ASC']],
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });

    return advertisers.map((advertiser) => toAdvertiserDto(advertiser));
  }

  async listCampaigns(scope: PortalScope, query: CampaignsQueryDto): Promise<PortalCampaignDto[]> {
    await this.scopeService.assertAdvertiserAccess(scope, query.advertiserId);

    const campaigns = await this.campaignModel.findAll({
      where: { advertiserId: query.advertiserId },
      order: [['createdAt', 'DESC']],
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });

    return campaigns.map((campaign) => toCampaignDto(campaign, isCampaignToggleable(campaign)));
  }
}
