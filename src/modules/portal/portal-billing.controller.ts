import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../common/types/auth-context.types';
import { RequestId } from '../ads/decorators/request-id.decorator';
import { PortalSubscriptionCommandService } from './commands/portal-subscription-commands.service';
import { buildPortalActor } from './portal-actor';
import { PORTAL_ROLES } from './portal.constants';
import { PortalScopeService } from './portal.scope.service';
import { PortalBillingQueryService } from './queries/portal-billing-query.service';
import {
  SubscribeDto,
  SubscriptionQueryDto,
  subscribeSchema,
  subscriptionQuerySchema,
} from './portal.schemas';

/** Suscripción, comisiones y panel de facturación: `portal/subscription`, `commissions`, `billing`. */
@Controller('portal')
export class PortalBillingController {
  constructor(
    private readonly scopeService: PortalScopeService,
    private readonly billing: PortalBillingQueryService,
    private readonly subscriptions: PortalSubscriptionCommandService,
  ) {}

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
    return this.subscriptions.subscribe(
      body,
      await buildPortalActor(this.scopeService, user, requestId),
    );
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

  @Roles(...PORTAL_ROLES)
  @Get('billing')
  async getBilling(
    @Query(new ZodValidationPipe(subscriptionQuerySchema)) query: SubscriptionQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scope = await this.scopeService.resolveScope(user);
    return this.billing.getBillingPanel(scope, query.merchantAccountId);
  }
}
