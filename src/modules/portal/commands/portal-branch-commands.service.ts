import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  B2BAccountModel,
  MerchantBranchModel,
} from '../../b2b-sales-crm/models/b2b-sales-crm.models';
import { sucursalPuedeVenderACredito } from '../../b2b-sales-crm/domain/branch-bnpl';
import { BusinessActionLogsService } from '../../business-action-logs/business-action-logs.service';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import { PORTAL_MODULE_CODE } from '../portal.constants';
import { toBranchDto, type PortalBranchDto } from '../portal.mappers';
import type { PortalActor } from '../portal-actor';
import { PortalScopeService } from '../portal.scope.service';
import type {
  CreatePortalBranchDto,
  SetPortalBranchStatusDto,
  UpdatePortalBranchDto,
} from '../portal.schemas';

/** Alta, edición y baja de sucursales por el propio comercio. */
@Injectable()
export class PortalBranchCommandService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly logger: PinoLoggerService,
    private readonly scopeService: PortalScopeService,
    private readonly businessActionLogs: BusinessActionLogsService,
    @InjectModel(MerchantBranchModel) private readonly branchModel: typeof MerchantBranchModel,
    @InjectModel(B2BAccountModel) private readonly accountModel: typeof B2BAccountModel,
  ) {}

  /*
   * Alta, edición y baja de sucursales POR EL PROPIO COMERCIO.
   *
   * Antes esto sólo existía en el canal interno `/b2b/*`, así que el comercio veía la pantalla de
   * sucursales en modo lectura: podía mirar las suyas y nada más. La cuenta nunca se toma del
   * cuerpo de la petición: la resuelve `PortalScopeService` con las membresías reales del usuario.
   *
   * No hay borrado, y no es un olvido: de una sucursal cuelgan sus terminales, sus QR y las ventas
   * que originó, y esas cuotas siguen venciendo. Lo que se necesita es que deje de operar —estado
   * INACTIVE—, no que deje de haber existido.
   */
  async createBranch(input: CreatePortalBranchDto, actor: PortalActor): Promise<PortalBranchDto> {
    const accountId = this.scopeService.resolveAccountId(actor.scope, input.merchantAccountId);
    return this.sequelize.transaction(async (transaction) => {
      const cuenta = await this.accountModel.findByPk(accountId, { transaction });
      const branch = await this.branchModel.create(
        {
          accountId,
          name: input.name,
          city: input.city ?? null,
          address: input.address ?? null,
          // Nace operativa: el comercio está declarando un local en el que ya atiende. Si Atlas YA aprobó
          // al comercio, el local vende a crédito (regla única, `branch-bnpl.ts`); si no, queda «Por
          // habilitar» hasta la aprobación. El comercio no elige: la capacidad no viene del cuerpo.
          status: 'ACTIVE',
          canOriginateBnpl: sucursalPuedeVenderACredito({
            lifecycleStatus: cuenta?.lifecycleStatus,
            branchStatus: 'ACTIVE',
          }),
          activatedAt: new Date(),
        },
        { transaction },
      );

      await this.businessActionLogs.record({
        moduleCode: PORTAL_MODULE_CODE,
        businessProcess: 'MERCHANT_STRUCTURE',
        actionCode: 'PORTAL_CREATE_BRANCH',
        actorUserId: actor.user.sub,
        actorRole: actor.user.role ?? null,
        aggregateType: 'MERCHANT_BRANCH',
        aggregateId: branch.id,
        correlationId: accountId,
        requestId: actor.requestId,
        affectedTables: ['merchant_branches'],
        affectedRecordCount: 1,
        status: 'SUCCESS',
        inputSummary: {
          name: input.name,
          city: input.city ?? null,
          delegated: actor.scope.isInternalOperator,
        },
        outputSummary: { branchId: branch.id },
        transaction,
      });

      this.logger.infoContext(
        PortalBranchCommandService.name,
        'Sucursal creada desde el portal del comercio',
        {
          branchId: branch.id,
          accountId,
        },
      );
      return toBranchDto(branch);
    });
  }

  async updateBranch(
    branchId: string,
    input: UpdatePortalBranchDto,
    actor: PortalActor,
  ): Promise<PortalBranchDto> {
    return this.sequelize.transaction(async (transaction) => {
      const branch = await this.findOwnBranch(branchId, actor, transaction);
      const before = branch.get({ plain: true }) as Record<string, unknown>;
      await branch.update(input, { transaction });

      await this.businessActionLogs.record({
        moduleCode: PORTAL_MODULE_CODE,
        businessProcess: 'MERCHANT_STRUCTURE',
        actionCode: 'PORTAL_UPDATE_BRANCH',
        actorUserId: actor.user.sub,
        actorRole: actor.user.role ?? null,
        aggregateType: 'MERCHANT_BRANCH',
        aggregateId: branch.id,
        correlationId: branch.accountId,
        requestId: actor.requestId,
        affectedTables: ['merchant_branches'],
        affectedRecordCount: 1,
        status: 'SUCCESS',
        inputSummary: {
          changed: Object.keys(input),
          before: { name: before.name ?? null, city: before.city ?? null },
        },
        outputSummary: { branchId: branch.id },
        transaction,
      });
      return toBranchDto(branch);
    });
  }

  async setBranchStatus(
    branchId: string,
    input: SetPortalBranchStatusDto,
    actor: PortalActor,
  ): Promise<PortalBranchDto> {
    return this.sequelize.transaction(async (transaction) => {
      const branch = await this.findOwnBranch(branchId, actor, transaction);
      if (branch.status === input.status) return toBranchDto(branch);

      const before = branch.status;
      const cuenta = await this.accountModel.findByPk(branch.accountId, { transaction });
      // Dada de baja, nunca vende. Al reactivarla, vende si el comercio está aprobado y Atlas no la apagó
      // (antes la baja la dejaba sin crédito PARA SIEMPRE: la reactivación no lo devolvía).
      const vende =
        input.status === 'ACTIVE' &&
        !branch.bnplBlockedByAtlas &&
        (branch.canOriginateBnpl ||
          sucursalPuedeVenderACredito({
            lifecycleStatus: cuenta?.lifecycleStatus,
            branchStatus: input.status,
            bnplBlockedByAtlas: branch.bnplBlockedByAtlas,
          }));
      await branch.update(
        {
          status: input.status,
          canOriginateBnpl: vende,
          ...(input.status === 'ACTIVE' && !branch.activatedAt ? { activatedAt: new Date() } : {}),
        },
        { transaction },
      );

      await this.businessActionLogs.record({
        moduleCode: PORTAL_MODULE_CODE,
        businessProcess: 'MERCHANT_STRUCTURE',
        actionCode: 'PORTAL_SET_BRANCH_STATUS',
        actorUserId: actor.user.sub,
        actorRole: actor.user.role ?? null,
        aggregateType: 'MERCHANT_BRANCH',
        aggregateId: branch.id,
        correlationId: branch.accountId,
        requestId: actor.requestId,
        affectedTables: ['merchant_branches'],
        affectedRecordCount: 1,
        status: 'SUCCESS',
        inputSummary: { from: before, to: input.status },
        outputSummary: { branchId: branch.id },
        transaction,
      });
      return toBranchDto(branch);
    });
  }

  /** Carga la sucursal comprobando que pertenece a una cuenta del alcance de quien pregunta. */
  private async findOwnBranch(
    branchId: string,
    actor: PortalActor,
    transaction: Transaction,
  ): Promise<MerchantBranchModel> {
    const branch = await this.branchModel.findByPk(branchId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!branch) {
      throw new NotFoundException({ code: 'BRANCH_NOT_FOUND', message: 'Sucursal no encontrada.' });
    }
    this.scopeService.assertAccountAccess(actor.scope, branch.accountId);
    return branch;
  }
}
