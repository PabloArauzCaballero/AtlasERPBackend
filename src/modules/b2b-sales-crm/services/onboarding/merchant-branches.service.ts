import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PinoLoggerService } from '../../../../common/logging/pino-logger.service';
import { BranchStatus } from '../../b2b-sales-crm.enums';
import type {
  CreateBranchDto,
  SetBranchStatusDto,
  UpdateBranchDto,
} from '../../b2b-sales-crm.dtos';
import { sucursalPuedeVenderACredito } from '../../domain/branch-bnpl';
import { B2BSalesCrmRepository } from '../../repositories/b2b-sales-crm.repository';
import { OnboardingUseCase } from './onboarding-use-case.base';

/** Las sucursales de un comercio: alta, edición, baja y consulta. */
@Injectable()
export class MerchantBranchesService extends OnboardingUseCase {
  constructor(repository: B2BSalesCrmRepository, logger: PinoLoggerService) {
    super(repository, logger);
  }

  /** Edita una sucursal existente. No cambia de comercio: eso movería ventas de cuenta. */
  async updateBranch(
    branchId: string,
    input: UpdateBranchDto,
    allowedAccountIds: readonly string[] | null = null,
  ): Promise<Record<string, unknown>> {
    this.announce('updateBranch');
    const branch = await this.repository.branches.findByPk(branchId);
    if (!branch) throw new NotFoundException('Sucursal no encontrada.');
    this.assertBranchAccount(branch.accountId, allowedAccountIds);

    await branch.update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      // Atlas decide a mano: apagar la deja «apagada por Atlas» (la regla de aprobación no la reenciende);
      // encenderla levanta esa marca.
      ...(input.canOriginateBnpl !== undefined
        ? { canOriginateBnpl: input.canOriginateBnpl, bnplBlockedByAtlas: !input.canOriginateBnpl }
        : {}),
    });
    return this.describeBranch(branch);
  }

  /**
   * Da de alta o de baja una sucursal. NO la borra.
   *
   * Borrarla se llevaria por delante el historial de las ventas que origino. Una sucursal cerrada
   * tiene que seguir siendo consultable: sus cuotas siguen venciendo y alguien tendra que explicar
   * de donde salieron. Al desactivarla se le quita ademas la capacidad de originar BNPL, que es lo
   * que de verdad significa «cerrada» para el negocio.
   */
  async setBranchStatus(
    branchId: string,
    input: SetBranchStatusDto,
    allowedAccountIds: readonly string[] | null = null,
  ): Promise<Record<string, unknown>> {
    this.announce('setBranchStatus');
    const branch = await this.repository.branches.findByPk(branchId);
    if (!branch) throw new NotFoundException('Sucursal no encontrada.');
    this.assertBranchAccount(branch.accountId, allowedAccountIds);

    const activa = input.status === 'ACTIVE';
    const cuenta = await this.repository.accounts.findByPk(branch.accountId);
    // Al darla de alta: vende si el comercio está aprobado (regla única), o si Atlas ya se la había
    // concedido a mano y no la apagó. Dada de baja, nunca.
    const vende =
      activa &&
      !branch.bnplBlockedByAtlas &&
      (branch.canOriginateBnpl ||
        sucursalPuedeVenderACredito({
          lifecycleStatus: cuenta?.lifecycleStatus,
          branchStatus: input.status,
          bnplBlockedByAtlas: branch.bnplBlockedByAtlas,
        }));
    await branch.update({
      status: input.status,
      canOriginateBnpl: vende,
      ...(activa && !branch.activatedAt ? { activatedAt: new Date() } : {}),
    });
    return this.describeBranch(branch);
  }

  private describeBranch(branch: {
    id: string;
    accountId: string;
    name: string;
    city: string | null;
    address: string | null;
    status: string;
    canOriginateBnpl: boolean;
  }): Record<string, unknown> {
    return {
      id: branch.id,
      accountId: branch.accountId,
      name: branch.name,
      city: branch.city,
      address: branch.address,
      status: branch.status,
      canOriginateBnpl: branch.canOriginateBnpl,
    };
  }

  /**
   * Las sucursales de un comercio.
   *
   * Sin esto, `POST /b2b/onboarding/branches` era escritura sin lectura: la sucursal quedaba en la
   * tabla y ninguna respuesta del ERP volvía a nombrarla. `canOriginateBnpl` es lo que decide si en
   * esa sucursal se puede vender a plazos, así que es lo primero que hay que poder mirar.
   */
  async listBranches(filtro: {
    accountId?: string | undefined;
    status?: string | undefined;
  }): Promise<Record<string, unknown>[]> {
    const where: Record<string, unknown> = {};
    if (filtro.accountId) where.accountId = filtro.accountId;
    if (filtro.status) where.status = filtro.status;

    const branches = await this.repository.branches.findAll({
      where,
      order: [
        ['account_id', 'ASC'],
        ['name', 'ASC'],
      ],
    });
    return branches.map((branch) => this.describeBranch(branch));
  }

  /**
   * `allowedAccountIds` es el alcance del llamador: `null` para staff (opera cualquier comercio) y
   * las cuentas de sus membresías para un comercio. Estas rutas aceptan `MERCHANT_ADMIN` y no
   * miraban de quién era la sucursal: el comercio B renombraba, cerraba o abría sucursales del A
   * (P-13).
   */
  private assertBranchAccount(accountId: string, allowedAccountIds: readonly string[] | null) {
    if (allowedAccountIds === null || allowedAccountIds.includes(accountId)) return;
    throw new ForbiddenException({
      code: 'MERCHANT_ACCOUNT_FORBIDDEN',
      message: 'No tienes permiso para operar esta cuenta de comercio.',
    });
  }

  async createBranch(
    input: CreateBranchDto,
    allowedAccountIds: readonly string[] | null = null,
  ): Promise<Record<string, unknown>> {
    this.announce('createBranch');
    this.assertBranchAccount(input.accountId, allowedAccountIds);
    const account = await this.repository.accounts.findByPk(input.accountId);

    if (!account) {
      throw new NotFoundException('Cuenta B2B no encontrada.');
    }

    const branch = await this.repository.branches.create({
      accountId: input.accountId,
      name: input.name,
      city: input.city ?? null,
      address: input.address ?? null,
      status: BranchStatus.PENDING,
      canOriginateBnpl: false,
    });

    return {
      id: branch.id,
      accountId: branch.accountId,
      name: branch.name,
      status: branch.status,
      canOriginateBnpl: branch.canOriginateBnpl,
    };
  }
}
