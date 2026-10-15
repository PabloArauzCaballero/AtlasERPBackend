import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import {
  BankAccountModel,
  BusinessPartnerModel,
  CostCenterModel,
  ProfitCenterModel,
} from '../../../../database/models';
import { AuthUser } from '../../../../common/types/auth-context.types';
import { LegalEntityAccessService } from '../../../../common/services/legal-entity-access.service';
import { legalEntityScope } from '../domain/financial-structure-rules';

/** Listados maestros de centros y cuentas bancarias, acotados a las entidades del token. */
@Injectable()
export class MasterDataListings {
  constructor(
    private readonly legalEntityAccessService: LegalEntityAccessService,
    @InjectModel(CostCenterModel) private readonly costCenterModel: typeof CostCenterModel,
    @InjectModel(ProfitCenterModel) private readonly profitCenterModel: typeof ProfitCenterModel,
    @InjectModel(BankAccountModel) private readonly bankAccountModel: typeof BankAccountModel,
    @InjectModel(BusinessPartnerModel)
    private readonly businessPartnerModel: typeof BusinessPartnerModel,
  ) {}

  listCostCenters(user: AuthUser) {
    return this.costCenterModel.findAll({
      where: this.scopeOf(user),
      order: [['code', 'ASC']],
    });
  }

  listProfitCenters(user: AuthUser) {
    return this.profitCenterModel.findAll({
      where: this.scopeOf(user),
      order: [['code', 'ASC']],
    });
  }

  /**
   * Cuentas bancarias con el NOMBRE del banco (su socio de negocio, `bankBpId`) y SIN
   * `accountNoHash`: una huella del número no le sirve a nadie en pantalla y no debe salir de aquí.
   * No hay `accountNumberMasked`: el número en claro no se guarda en ningún sitio, y la huella no se
   * puede desenmascarar; inventar los últimos dígitos sería mentir.
   */
  async listBankAccounts(user: AuthUser) {
    const rows = await this.bankAccountModel.findAll({
      where: this.scopeOf(user),
      order: [['accountName', 'ASC']],
      attributes: { exclude: ['accountNoHash'] },
    });
    const bankIds = [
      ...new Set(rows.map((row) => row.bankBpId).filter((id): id is string => !!id)),
    ];
    const banks = bankIds.length
      ? await this.businessPartnerModel.findAll({
          where: { id: { [Op.in]: bankIds } },
          attributes: ['id', 'legalName', 'tradeName'],
        })
      : [];
    const bankName = new Map(banks.map((bank) => [bank.id, bank.tradeName ?? bank.legalName]));
    return rows.map((row) => {
      const plain = row.get({ plain: true }) as Record<string, unknown>;
      delete plain.accountNoHash;
      return { ...plain, bankName: row.bankBpId ? (bankName.get(row.bankBpId) ?? null) : null };
    });
  }

  private scopeOf(user: AuthUser) {
    return legalEntityScope(this.legalEntityAccessService.accessibleLegalEntityIds(user));
  }
}
