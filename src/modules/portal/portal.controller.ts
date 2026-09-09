import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../common/types/auth-context.types';
import { RequestId } from '../ads/decorators/request-id.decorator';
import { PORTAL_PLAN_ADMIN_ROLES, PORTAL_ROLES } from './portal.constants';
import { PortalService, type PortalActor } from './portal.service';
import {
  AdvertisersQueryDto,
  BillingProductsQueryDto,
  BranchesQueryDto,
  CampaignsQueryDto,
  CreatePlanDto,
  CreatePortalBranchDto,
  IdParamsDto,
  PlansQueryDto,
  SetCampaignStatusDto,
  SetPortalBranchStatusDto,
  SubscribeDto,
  SubscriptionQueryDto,
  UpdatePlanDto,
  UpdatePortalBranchDto,
  advertisersQuerySchema,
  billingProductsQuerySchema,
  branchesQuerySchema,
  campaignsQuerySchema,
  createPlanSchema,
  createPortalBranchSchema,
  idParamsSchema,
  plansQuerySchema,
  setCampaignStatusSchema,
  setPortalBranchStatusSchema,
  subscribeSchema,
  subscriptionQuerySchema,
  updatePlanSchema,
  updatePortalBranchSchema,
} from './portal.schemas';

/**
 * Portal del comercio (usuario partner).
 *
 * `@Roles` solo decide *quién es* el llamador; *qué puede tocar* lo decide siempre
 * `PortalScopeService` a partir de sus membresías reales. Ningún handler pasa un identificador
 * del cliente directamente a la capa de datos.
 */
@Controller('portal')
export class PortalController {
  constructor(private readonly service: PortalService) {}

  @Roles(...PORTAL_ROLES)
  @Get('plans')
  async listPlans(@Query(new ZodValidationPipe(plansQuerySchema)) query: PlansQueryDto) {
    return this.service.listPlans(query);
  }

  @Roles(...PORTAL_PLAN_ADMIN_ROLES)
  @Post('plans')
  async createPlan(
    @Body(new ZodValidationPipe(createPlanSchema)) body: CreatePlanDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.service.createPlan(body, await this.buildActor(user, requestId));
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
    return this.service.updatePlan(params.id, body, await this.buildActor(user, requestId));
  }

  /** Catálogo de lo que Atlas factura. Sólo lectura: el precio se configura en la tarifa. */
  @Roles(...PORTAL_ROLES)
  @Get('billing-products')
  async listBillingProducts(
    @Query(new ZodValidationPipe(billingProductsQuerySchema)) query: BillingProductsQueryDto,
  ) {
    return this.service.listBillingProducts(query);
  }

  @Roles(...PORTAL_ROLES)
  @Get('subscription')
  async getSubscription(
    @Query(new ZodValidationPipe(subscriptionQuerySchema)) query: SubscriptionQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scope = await this.service.resolveScope(user);
    return this.service.getSubscription(scope, query.merchantAccountId);
  }

  @Roles(...PORTAL_ROLES)
  @Post('subscription')
  async subscribe(
    @Body(new ZodValidationPipe(subscribeSchema)) body: SubscribeDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.service.subscribe(body, await this.buildActor(user, requestId));
  }

  /*
   * Lo que este comercio le debe a Atlas por usar el servicio: la comision de cada venta.
   *
   * Va por el canal del PORTAL y no por `/b2b/*` porque quien lo mira es el comercio sobre lo suyo,
   * y `PortalScopeService` es quien resuelve de que cuenta se trata: pedirle el `accountId` habria
   * dejado que uno consultara la comision de otro.
   */
  @Roles(...PORTAL_ROLES)
  @Get('commissions')
  async commissions(
    @Query('merchantAccountId') merchantAccountId: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    const scope = await this.service.resolveScope(user);
    return this.service.listCommissions(scope, merchantAccountId);
  }

  /* Sin `@Roles`, `RolesGuard` deja pasar a cualquier sesión autenticada: faltaba. */
  @Roles(...PORTAL_ROLES)
  @Get('branches')
  async listBranches(
    @Query(new ZodValidationPipe(branchesQuerySchema)) query: BranchesQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scope = await this.service.resolveScope(user);
    return this.service.listBranches(scope, query);
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
    return this.service.createBranch(body, await this.buildActor(user, requestId));
  }

  @Roles(...PORTAL_ROLES)
  @Patch('branches/:id')
  async updateBranch(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Body(new ZodValidationPipe(updatePortalBranchSchema)) body: UpdatePortalBranchDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.service.updateBranch(params.id, body, await this.buildActor(user, requestId));
  }

  @Roles(...PORTAL_ROLES)
  @Patch('branches/:id/status')
  async setBranchStatus(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Body(new ZodValidationPipe(setPortalBranchStatusSchema)) body: SetPortalBranchStatusDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.service.setBranchStatus(params.id, body, await this.buildActor(user, requestId));
  }

  /**
   * Quién eres para el portal, y sobre qué comercios puedes operar.
   *
   * Lo contesta el servidor porque es el único que lo sabe: el navegador se lo guardaba al entrar
   * y podía quedarse en desacuerdo con el token, dejando la pantalla sin salida.
   */
  @Roles(...PORTAL_ROLES)
  @Get('scope')
  async getScope(@CurrentUser() user: AuthUser) {
    return this.service.getScope(await this.service.resolveScope(user));
  }

  @Roles(...PORTAL_ROLES)
  @Get('billing')
  async getBilling(
    @Query(new ZodValidationPipe(subscriptionQuerySchema)) query: SubscriptionQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scope = await this.service.resolveScope(user);
    return this.service.getBillingPanel(scope, query.merchantAccountId);
  }

  /** Una factura concreta con sus líneas: es lo que se imprime al descargarla. */
  @Roles(...PORTAL_ROLES)
  @Get('billing/invoices/:id')
  async getInvoiceDocument(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(subscriptionQuerySchema)) query: SubscriptionQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scope = await this.service.resolveScope(user);
    return this.service.getInvoiceDocument(scope, id, query.merchantAccountId);
  }

  @Roles(...PORTAL_ROLES)
  @Get('advertisers')
  async listAdvertisers(
    @Query(new ZodValidationPipe(advertisersQuerySchema)) query: AdvertisersQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scope = await this.service.resolveScope(user);
    return this.service.listAdvertisers(scope, query);
  }

  @Roles(...PORTAL_ROLES)
  @Get('campaigns')
  async listCampaigns(
    @Query(new ZodValidationPipe(campaignsQuerySchema)) query: CampaignsQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scope = await this.service.resolveScope(user);
    return this.service.listCampaigns(scope, query);
  }

  @Roles(...PORTAL_ROLES)
  @Patch('campaigns/:id/status')
  async setCampaignStatus(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Body(new ZodValidationPipe(setCampaignStatusSchema)) body: SetCampaignStatusDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.service.setCampaignStatus(params.id, body, await this.buildActor(user, requestId));
  }

  private async buildActor(user: AuthUser, requestId: string): Promise<PortalActor> {
    return { user, requestId, scope: await this.service.resolveScope(user) };
  }
}
