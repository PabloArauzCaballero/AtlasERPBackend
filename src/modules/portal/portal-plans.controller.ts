import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../common/types/auth-context.types';
import { RequestId } from '../ads/decorators/request-id.decorator';
import { PortalPlanCommandService } from './commands/portal-plan-commands.service';
import { buildPortalActor } from './portal-actor';
import { PORTAL_PLAN_ADMIN_ROLES, PORTAL_ROLES } from './portal.constants';
import { PortalScopeService } from './portal.scope.service';
import { PortalCatalogQueryService } from './queries/portal-catalog-query.service';
import {
  BillingProductsQueryDto,
  CreatePlanDto,
  IdParamsDto,
  PlansQueryDto,
  UpdatePlanDto,
  billingProductsQuerySchema,
  createPlanSchema,
  idParamsSchema,
  plansQuerySchema,
  updatePlanSchema,
} from './portal.schemas';

/** Tarifa y catálogo del portal: `portal/plans` y `portal/billing-products`. */
@Controller('portal')
export class PortalPlansController {
  constructor(
    private readonly scopeService: PortalScopeService,
    private readonly catalog: PortalCatalogQueryService,
    private readonly plans: PortalPlanCommandService,
  ) {}

  @Roles(...PORTAL_ROLES)
  @Get('plans')
  async listPlans(@Query(new ZodValidationPipe(plansQuerySchema)) query: PlansQueryDto) {
    return this.catalog.listPlans(query);
  }

  @Roles(...PORTAL_PLAN_ADMIN_ROLES)
  @Post('plans')
  async createPlan(
    @Body(new ZodValidationPipe(createPlanSchema)) body: CreatePlanDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.plans.createPlan(body, await buildPortalActor(this.scopeService, user, requestId));
  }

  /*
   * Edición de la tarifa: es el pricing de la plataforma, así que sólo lo tocan los roles que ya
   * podían crear planes, y cada cambio queda con su valor anterior en la bitácora de negocio.
   */
  @Roles(...PORTAL_PLAN_ADMIN_ROLES)
  @Patch('plans/:id')
  async updatePlan(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Body(new ZodValidationPipe(updatePlanSchema)) body: UpdatePlanDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.plans.updatePlan(
      params.id,
      body,
      await buildPortalActor(this.scopeService, user, requestId),
    );
  }

  /** Catálogo de lo que Atlas factura. Sólo lectura: el precio se configura en la tarifa. */
  @Roles(...PORTAL_ROLES)
  @Get('billing-products')
  async listBillingProducts(
    @Query(new ZodValidationPipe(billingProductsQuerySchema)) query: BillingProductsQueryDto,
  ) {
    return this.catalog.listBillingProducts(query);
  }
}
