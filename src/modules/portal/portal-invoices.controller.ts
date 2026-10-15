import { Controller, Get, Param, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../common/types/auth-context.types';
import { PortalFiscalService } from './portal-fiscal.service';
import { PORTAL_ROLES } from './portal.constants';
import { PortalScopeService } from './portal.scope.service';
import { PortalBillingQueryService } from './queries/portal-billing-query.service';
import { SubscriptionQueryDto, subscriptionQuerySchema } from './portal.schemas';

/** Facturas del comercio y su representación fiscal: `portal/billing/invoices/:id/...`. */
@Controller('portal')
export class PortalInvoicesController {
  constructor(
    private readonly scopeService: PortalScopeService,
    private readonly billing: PortalBillingQueryService,
    private readonly fiscal: PortalFiscalService,
  ) {}

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
}
