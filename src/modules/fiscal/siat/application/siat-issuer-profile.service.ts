import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, UniqueConstraintError, WhereOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { LegalEntityAccessService } from '../../../../common/services/legal-entity-access.service';
import { AuthUser } from '../../../../common/types/auth-context.types';
import { SiatIssuerProfileModel, SiatNumberSeriesModel } from '../../../../database/models';
import type { CreateIssuerProfileDto, UpdateIssuerProfileDto } from '../fiscal-siat.schemas';

/**
 * El emisor ante el SIN, acotado por entidad legal: quien no tiene la entidad en su token no ve
 * ni opera su perfil fiscal (P-13), igual que el resto de la contabilidad.
 */
@Injectable()
export class SiatIssuerProfileService {
  constructor(
    @InjectModel(SiatIssuerProfileModel)
    private readonly profileModel: typeof SiatIssuerProfileModel,
    @InjectModel(SiatNumberSeriesModel)
    private readonly seriesModel: typeof SiatNumberSeriesModel,
    private readonly access: LegalEntityAccessService,
    private readonly sequelize: Sequelize,
  ) {}

  listar(user: AuthUser) {
    const allowed = this.access.accessibleLegalEntityIds(user);
    const where: WhereOptions =
      allowed === null ? {} : { legalEntityId: { [Op.in]: [...allowed] } };
    return this.profileModel.findAll({ where, order: [['createdAt', 'ASC']] });
  }

  async obtener(id: string, user: AuthUser): Promise<SiatIssuerProfileModel> {
    const perfil = await this.profileModel.findByPk(id);
    // Un perfil de otra entidad se contesta como inexistente: no se confirma que exista.
    if (!perfil || !this.access.canAccessLegalEntity(user, perfil.legalEntityId)) {
      throw new NotFoundException({
        code: 'FISCAL_ISSUER_NOT_FOUND',
        message: 'No existe ese perfil de emisor o no tienes acceso a su entidad legal.',
      });
    }
    return perfil;
  }

  /** El perfil activo de una entidad (sucursal 0, punto de venta 0 salvo que se pida otro). */
  async activoDe(legalEntityId: string, codigoSucursal = 0, codigoPuntoVenta = 0) {
    return this.profileModel.findOne({
      where: { legalEntityId, codigoSucursal, codigoPuntoVenta, status: 'ACTIVE' },
    });
  }

  async crear(input: CreateIssuerProfileDto, user: AuthUser) {
    this.access.assertCanAccessLegalEntity(user, input.legalEntityId);
    try {
      return await this.sequelize.transaction(async (transaction) => {
        const perfil = await this.profileModel.create({ ...input }, { transaction });
        await this.seriesModel.create(
          { issuerProfileId: perfil.id, lastNumber: '0' },
          { transaction },
        );
        return perfil;
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new ConflictException({
          code: 'FISCAL_ISSUER_ALREADY_EXISTS',
          message:
            'Esa entidad legal ya tiene un emisor para esa sucursal y punto de venta del SIN.',
        });
      }
      throw error;
    }
  }

  async actualizar(id: string, input: UpdateIssuerProfileDto, user: AuthUser) {
    const perfil = await this.obtener(id, user);
    return perfil.update(input);
  }
}
