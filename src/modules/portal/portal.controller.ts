import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { PortalFiscalService } from './portal-fiscal.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../common/types/auth-context.types';
import { RequestId } from '../ads/decorators/request-id.decorator';
import { PORTAL_PLAN_ADMIN_ROLES, PORTAL_ROLES } from './portal.constants';
import type { PortalActor } from './portal-actor';
import { PortalScopeService } from './portal.scope.service';
import { PortalBranchCommandService } from './commands/portal-branch-commands.service';
import { PortalCampaignCommandService } from './commands/portal-campaign-commands.service';
import { PortalPlanCommandService } from './commands/portal-plan-commands.service';
import { PortalSubscriptionCommandService } from './commands/portal-subscription-commands.service';
import { PortalBillingQueryService } from './queries/portal-billing-query.service';
import { PortalCatalogQueryService } from './queries/portal-catalog-query.service';
import { PortalMerchantQueryService } from './queries/portal-merchant-query.service';
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
  constructor(
    private readonly scopeService: PortalScopeService,
    private readonly catalog: PortalCatalogQueryService,
    private readonly billing: PortalBillingQueryService,
    private readonly merchant: PortalMerchantQueryService,
    private readonly plans: PortalPlanCommandService,
    private readonly subscriptions: PortalSubscriptionCommandService,
    private readonly branches: PortalBranchCommandService,
    private readonly campaigns: PortalCampaignCommandService,
    private readonly fiscal: PortalFiscalService,
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
    return this.plans.createPlan(body, await this.buildActor(user, requestId));
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
    return this.plans.updatePlan(params.id, body, await this.buildActor(user, requestId));
  }

  /** Catálogo de lo que Atlas factura. Sólo lectura: el precio se configura en la tarifa. */
  @Roles(...PORTAL_ROLES)
  @Get('billing-products')
  async listBillingProducts(
    @Query(new ZodValidationPipe(billingProductsQuerySchema)) query: BillingProductsQueryDto,
  ) {
    return this.catalog.listBillingProducts(query);
  }

  @Roles(...PORTAL_ROLES)
  @Get('subscription')
  async getSubscription(
    @Query(new ZodValidationPipe(subscriptionQuerySchema)) query: SubscriptionQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scope = await this.scopeService.resolveScope(user);
    return this.billing.getSubscription(scope, query.merchantAccountId);
  }

  @Roles(...PORTAL_ROLES)
  @Post('subscription')
  async subscribe(
    @Body(new ZodValidationPipe(subscribeSchema)) body: SubscribeDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.subscriptions.subscribe(body, await this.buildActor(user, requestId));
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
    const scope = await this.scopeService.resolveScope(user);
    return this.billing.listCommissions(scope, merchantAccountId);
  }

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
    return this.branches.createBranch(body, await this.buildActor(user, requestId));
  }

  @Roles(...PORTAL_ROLES)
  @Patch('branches/:id')
  async updateBranch(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Body(new ZodValidationPipe(updatePortalBranchSchema)) body: UpdatePortalBranchDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.branches.updateBranch(params.id, body, await this.buildActor(user, requestId));
  }

  @Roles(...PORTAL_ROLES)
  @Patch('branches/:id/status')
  async setBranchStatus(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Body(new ZodValidationPipe(setPortalBranchStatusSchema)) body: SetPortalBranchStatusDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.branches.setBranchStatus(params.id, body, await this.buildActor(user, requestId));
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
    return this.merchant.getScope(await this.scopeService.resolveScope(user));
  }

  @Roles(...PORTAL_ROLES)
  @Get('billing')
  async getBilling(
    @Query(new ZodValidationPipe(subscriptionQuerySchema)) query: SubscriptionQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scope = await this.scopeService.resolveScope(user);
    return this.billing.getBillingPanel(scope, query.merchantAccountId);
  }

  /** Una factura concreta con sus líneas: es lo que se imprime al descargarla. */
  @Roles(...PORTAL_ROLES)
  @Get('billing/invoices/:id')
  async getInvoiceDocument(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(subscriptionQuerySchema)) query: SubscriptionQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scope = await this.scopeService.resolveScope(user);
    const [documento, fiscal] = await Promise.all([
      this.billing.getInvoiceDocument(scope, id, query.merchantAccountId),
      this.fiscal.resumen(scope, id, query.merchantAccountId),
    ]);
    return { ...documento, fiscalDocument: fiscal };
  }

  /** La factura fiscal (representación gráfica) que el SIN obliga a entregar al comprador. */
  @Roles(...PORTAL_ROLES)
  @Get('billing/invoices/:id/fiscal/pdf')
  async getFiscalPdf(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(subscriptionQuerySchema)) query: SubscriptionQueryDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const scope = await this.scopeService.resolveScope(user);
    const { buffer, filename } = await this.fiscal.pdf(scope, id, query.merchantAccountId);
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  /** El XML de la factura tal como se envió al SIN. */
  @Roles(...PORTAL_ROLES)
  @Get('billing/invoices/:id/fiscal/xml')
  async getFiscalXml(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(subscriptionQuerySchema)) query: SubscriptionQueryDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const scope = await this.scopeService.resolveScope(user);
    const { xml, filename } = await this.fiscal.xml(scope, id, query.merchantAccountId);
    res.setHeader('content-type', 'application/xml; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(xml);
  }

  @Roles(...PORTAL_ROLES)
  @Get('advertisers')
  async listAdvertisers(
    @Query(new ZodValidationPipe(advertisersQuerySchema)) query: AdvertisersQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scope = await this.scopeService.resolveScope(user);
    return this.merchant.listAdvertisers(scope, query);
  }

  @Roles(...PORTAL_ROLES)
  @Get('campaigns')
  async listCampaigns(
    @Query(new ZodValidationPipe(campaignsQuerySchema)) query: CampaignsQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scope = await this.scopeService.resolveScope(user);
    return this.merchant.listCampaigns(scope, query);
  }

  @Roles(...PORTAL_ROLES)
  @Patch('campaigns/:id/status')
  async setCampaignStatus(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Body(new ZodValidationPipe(setCampaignStatusSchema)) body: SetCampaignStatusDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.campaigns.setCampaignStatus(
      params.id,
      body,
      await this.buildActor(user, requestId),
    );
  }

  private async buildActor(user: AuthUser, requestId: string): Promise<PortalActor> {
    return { user, requestId, scope: await this.scopeService.resolveScope(user) };
  }
}
