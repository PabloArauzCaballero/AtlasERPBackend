import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../../common/types/auth-context.types';
import type {
  BranchIdParamsDto,
  CreateBranchDto,
  ListBranchesQueryDto,
  SetBranchStatusDto,
  UpdateBranchDto,
} from '../b2b-sales-crm.dtos';
import {
  branchIdParamsSchema,
  createBranchSchema,
  listBranchesQuerySchema,
  setBranchStatusSchema,
  updateBranchSchema,
} from '../b2b-sales-crm.schemas';
import { PortalScopeService } from '../../portal/portal.scope.service';
import { MerchantBranchesService } from '../services/onboarding/merchant-branches.service';

/** Los roles de las rutas de sucursal que operan CUALQUIER comercio; el resto es el propio comercio. */
const BRANCH_STAFF_ROLES = ['OPERATIONS', 'ADMIN'] as const;

/** Sucursales del comercio: `b2b/onboarding/branches`. */
@Controller('b2b/onboarding')
export class OnboardingBranchesController {
  constructor(
    private readonly branches: MerchantBranchesService,
    private readonly scope: PortalScopeService,
  ) {}

  /*
   * Editar y dar de baja una sucursal. Faltaban: solo se podian crear, nunca corregir ni cerrar.
   *
   * Habia DOS `@Roles` seguidos aqui y el de arriba ganaba, asi que `MERCHANT_ADMIN` —que el de
   * abajo si concedia— quedaba fuera sin que nada lo dijera: el comercio recibia 403 al corregir su
   * propia sucursal y el codigo leia como que si podia.
   */
  @Roles('OPERATIONS', 'ADMIN', 'MERCHANT_ADMIN')
  @Patch('branches/:branchId')
  async updateBranch(
    @Param(new ZodValidationPipe(branchIdParamsSchema)) params: BranchIdParamsDto,
    @Body(new ZodValidationPipe(updateBranchSchema)) body: UpdateBranchDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    const allowed = await this.scope.restrictToOwnAccounts(user, BRANCH_STAFF_ROLES);
    return this.branches.updateBranch(params.branchId, body, allowed);
  }

  @Roles('OPERATIONS', 'ADMIN', 'MERCHANT_ADMIN')
  @Patch('branches/:branchId/status')
  async setBranchStatus(
    @Param(new ZodValidationPipe(branchIdParamsSchema)) params: BranchIdParamsDto,
    @Body(new ZodValidationPipe(setBranchStatusSchema)) body: SetBranchStatusDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    const allowed = await this.scope.restrictToOwnAccounts(user, BRANCH_STAFF_ROLES);
    return this.branches.setBranchStatus(params.branchId, body, allowed);
  }

  /** Las sucursales, para poder elegir dónde se origina una venta a plazos. */
  @Roles('OPERATIONS', 'ADMIN', 'COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'FINANCE')
  @Get('branches')
  listBranches(
    @Query(new ZodValidationPipe(listBranchesQuerySchema)) query: ListBranchesQueryDto,
  ): Promise<Record<string, unknown>[]> {
    return this.branches.listBranches(query);
  }

  /* Faltaba el `@Roles`: sin él, cualquier sesión del ERP podía abrir sucursales a cualquier comercio. */
  @Roles('OPERATIONS', 'ADMIN', 'MERCHANT_ADMIN')
  @Post('branches')
  async createBranch(
    @Body(new ZodValidationPipe(createBranchSchema)) body: CreateBranchDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    const allowed = await this.scope.restrictToOwnAccounts(user, BRANCH_STAFF_ROLES);
    return this.branches.createBranch(body, allowed);
  }
}
