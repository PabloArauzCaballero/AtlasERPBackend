import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../common/types/auth-context.types';
import { RequestId } from '../ads/decorators/request-id.decorator';
import { PortalBranchCommandService } from './commands/portal-branch-commands.service';
import { buildPortalActor } from './portal-actor';
import { PORTAL_ROLES } from './portal.constants';
import { PortalScopeService } from './portal.scope.service';
import { PortalMerchantQueryService } from './queries/portal-merchant-query.service';
import {
  BranchesQueryDto,
  CreatePortalBranchDto,
  IdParamsDto,
  SetPortalBranchStatusDto,
  UpdatePortalBranchDto,
  branchesQuerySchema,
  createPortalBranchSchema,
  idParamsSchema,
  setPortalBranchStatusSchema,
  updatePortalBranchSchema,
} from './portal.schemas';

/** Sucursales del comercio: `portal/branches`. */
@Controller('portal')
export class PortalBranchesController {
  constructor(
    private readonly scopeService: PortalScopeService,
    private readonly merchant: PortalMerchantQueryService,
    private readonly branches: PortalBranchCommandService,
  ) {}

  /* Sin `@Roles`, `RolesGuard` deja pasar a cualquier sesión autenticada: faltaba. */
  @Roles(...PORTAL_ROLES)
  @Get('branches')
  async listBranches(
    @Query(new ZodValidationPipe(branchesQuerySchema)) query: BranchesQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scope = await this.scopeService.resolveScope(user);
    return this.merchant.listBranches(scope, query);
  }

  /*
   * El comercio administra sus propias sucursales.
   *
   * Estas tres rutas son la razón de que la pantalla de sucursales dejara de ser de sólo lectura
   * para él: las de alta y edición vivían únicamente en `/b2b/*`, el canal interno de Atlas. La
   * cuenta sobre la que se opera la resuelve `PortalScopeService`, nunca el cuerpo de la petición.
   */
  @Roles(...PORTAL_ROLES)
  @Post('branches')
  async createBranch(
    @Body(new ZodValidationPipe(createPortalBranchSchema)) body: CreatePortalBranchDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.branches.createBranch(
      body,
      await buildPortalActor(this.scopeService, user, requestId),
    );
  }

  @Roles(...PORTAL_ROLES)
  @Patch('branches/:id')
  async updateBranch(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Body(new ZodValidationPipe(updatePortalBranchSchema)) body: UpdatePortalBranchDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.branches.updateBranch(
      params.id,
      body,
      await buildPortalActor(this.scopeService, user, requestId),
    );
  }

  @Roles(...PORTAL_ROLES)
  @Patch('branches/:id/status')
  async setBranchStatus(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Body(new ZodValidationPipe(setPortalBranchStatusSchema)) body: SetPortalBranchStatusDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.branches.setBranchStatus(
      params.id,
      body,
      await buildPortalActor(this.scopeService, user, requestId),
    );
  }
}
