import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { AtlasPartnerClient } from './atlas-partner.client';
import { upstreamAccessToken } from './partner-gateway.shared';

/**
 * El expediente del partner, visto desde el portal del comercio.
 *
 * Cada ruta reenvía a AtlasBackend, que es donde vive la evidencia y donde se aplican las reglas.
 * Este controlador no valida nada del dominio a propósito: repetir aquí la validación crearía una
 * segunda verdad que se desincroniza en cuanto una de las dos cambie, y la que manda es la que
 * guarda la evidencia.
 *
 * Los roles se declaran igualmente porque son la puerta de ESTE backend: sin ellos, cualquier
 * sesión del ERP podría usar el portal como trampolín hacia el otro servicio.
 *
 * `MERCHANT_ADMIN` está en todas: es el rol que la sesión del DUEÑO del comercio trae de verdad.
 * Faltaba en casi todas menos en `mine`, y el efecto era desconcertante —el portal sabía decir cuál
 * era tu expediente y devolvía 403 al abrirlo—, que en pantalla se veía como una página vacía.
 */
@Controller('partner-onboarding')
export class PartnerBranchesGatewayController {
  constructor(private readonly client: AtlasPartnerClient) {}

  @Post(':partnerId/branches')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  registerBranch(
    @Req() req: Request,
    @Param('partnerId') partnerId: string,
    @Body() body: unknown,
  ) {
    return this.client.forward({
      method: 'POST',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/branches`,
      accessToken: upstreamAccessToken(req),
      body,
    });
  }

  /**
   * Enlaza una sucursal YA declarada con la del ERP que le corresponde.
   *
   * Sin este tramo, una sucursal declarada antes de que el puente `erpBranchId` se rellenara sólo
   * podía enlazarse declarándola otra vez: dos filas para el mismo mostrador, con las cajas
   * colgando de una y el ERP mirando la otra.
   */
  @Patch(':partnerId/branches/:branchId')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  linkBranch(
    @Req() req: Request,
    @Param('partnerId') partnerId: string,
    @Param('branchId') branchId: string,
    @Body() body: unknown,
  ) {
    return this.client.forward({
      method: 'PATCH',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/branches/${encodeURIComponent(branchId)}`,
      accessToken: upstreamAccessToken(req),
      body,
    });
  }

  @Get(':partnerId/branches')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  listBranches(@Req() req: Request, @Param('partnerId') partnerId: string) {
    return this.client.forward({
      method: 'GET',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/branches`,
      accessToken: upstreamAccessToken(req),
    });
  }

  @Post(':partnerId/branches/:branchId/pos-terminals')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  registerPos(
    @Req() req: Request,
    @Param('partnerId') partnerId: string,
    @Param('branchId') branchId: string,
    @Body() body: unknown,
  ) {
    return this.client.forward({
      method: 'POST',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/branches/${encodeURIComponent(branchId)}/pos-terminals`,
      accessToken: upstreamAccessToken(req),
      body,
    });
  }

  @Get(':partnerId/pos-terminals')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  listPos(@Req() req: Request, @Param('partnerId') partnerId: string) {
    return this.client.forward({
      method: 'GET',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/pos-terminals`,
      accessToken: upstreamAccessToken(req),
    });
  }

  @Patch(':partnerId/pos-terminals/:terminalId')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  changePosStatus(
    @Req() req: Request,
    @Param('partnerId') partnerId: string,
    @Param('terminalId') terminalId: string,
    @Body() body: unknown,
  ) {
    return this.client.forward({
      method: 'PATCH',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/pos-terminals/${encodeURIComponent(terminalId)}`,
      accessToken: upstreamAccessToken(req),
      body,
    });
  }
}
