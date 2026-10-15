import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { BranchModel, LedgerModel, LegalEntityModel } from '../../../../database/models';
import { AuthUser } from '../../../../common/types/auth-context.types';
import { LegalEntityAccessService } from '../../../../common/services/legal-entity-access.service';
import {
  CreateBranchDto,
  CreateLedgerDto,
  CreateLegalEntityDto,
} from '../../shared/schemas/accounting.schemas';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';
import { legalEntityScope } from '../domain/financial-structure-rules';

/** Entidad legal, sucursales y libros (ledgers): quién contabiliza y en qué base. */
@Injectable()
export class LegalStructureService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly legalEntityAccessService: LegalEntityAccessService,
    private readonly logger: PinoLoggerService,
    @InjectModel(LegalEntityModel) private readonly legalEntityModel: typeof LegalEntityModel,
    @InjectModel(BranchModel) private readonly branchModel: typeof BranchModel,
    @InjectModel(LedgerModel) private readonly ledgerModel: typeof LedgerModel,
  ) {}

  createLegalEntity(input: CreateLegalEntityDto) {
    this.logger.info('Creando entidad legal.', {
      layer: 'service',
      module: 'financial-structure',
      action: 'createLegalEntity',
      code: input.code,
    });
    return this.legalEntityModel.create(input);
  }

  createBranch(input: CreateBranchDto, user: AuthUser) {
    this.logger.info('Creando sucursal.', {
      layer: 'service',
      module: 'financial-structure',
      action: 'createBranch',
      code: input.code,
      legalEntityId: input.legalEntityId,
      userId: user.sub,
    });
    this.legalEntityAccessService.assertCanAccessLegalEntity(user, input.legalEntityId);
    return this.branchModel.create(input);
  }

  createLedger(input: CreateLedgerDto, user: AuthUser) {
    this.logger.info('Creando ledger contable.', {
      layer: 'service',
      module: 'financial-structure',
      action: 'createLedger',
      code: input.code,
      accountingBasis: input.accountingBasis,
      legalEntityId: input.legalEntityId,
      userId: user.sub,
    });
    return this.sequelize.transaction(async (transaction) => {
      this.legalEntityAccessService.assertCanAccessLegalEntity(user, input.legalEntityId);
      if (input.isDefault) {
        const existingDefaultLedger = await this.ledgerModel.findOne({
          where: {
            legalEntityId: input.legalEntityId,
            accountingBasis: input.accountingBasis,
            isDefault: true,
          },
          transaction,
        });

        if (existingDefaultLedger) {
          throw new ConflictException({
            code: 'DEFAULT_LEDGER_ALREADY_EXISTS',
            message: 'Ya existe un ledger por defecto para esa entidad legal y base contable.',
          });
        }
      }

      return this.ledgerModel.create(input, { transaction });
    });
  }

  /*
   * Listados maestros para los selects: cada rol ve sólo las entidades de su token y ADMIN todas,
   * la misma regla que `LegalEntityAccessService` aplica al escribir (P-13).
   */
  listLegalEntities(user: AuthUser) {
    return this.legalEntityModel.findAll({
      where: legalEntityScope(this.legalEntityAccessService.accessibleLegalEntityIds(user), 'id'),
      order: [['code', 'ASC']],
    });
  }

  listBranches(user: AuthUser) {
    return this.branchModel.findAll({
      where: legalEntityScope(this.legalEntityAccessService.accessibleLegalEntityIds(user)),
      order: [['code', 'ASC']],
    });
  }

  listLedgers(user: AuthUser) {
    return this.ledgerModel.findAll({
      where: legalEntityScope(this.legalEntityAccessService.accessibleLegalEntityIds(user)),
      order: [['code', 'ASC']],
    });
  }
}
