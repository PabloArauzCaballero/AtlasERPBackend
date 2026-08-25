import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { AtlasPartnerClient } from './atlas-partner.client';

/** La MISMA cookie que emite el gateway de autenticacion; aqui solo se lee. */
const UPSTREAM_ACCESS_COOKIE = 'atlas_upstream_at';

/**
 * Las solicitudes de compra que esperan la respuesta del comercio.
 *
 * El cliente escanea el QR del local, pide un importe y el motor decide si lo aprueba y con que
 * esquema de pagos. Lo unico que le queda al comercio es decir SI o NO: aceptar o rechazar, nunca
 * editar. Si el comercio pudiera tocar el importe o el calendario estaria deshaciendo la decision
 * del motor —que es la que sostiene el riesgo de la operacion— desde el mostrador y sin dejar
 * rastro de que lo hizo.
 *
 * Reenvio fino hacia AtlasBackend, que es donde vive la evidencia y donde se comprueba que la
 * solicitud nacio EN ESTE comercio. Aqui no se valida el dominio a proposito: repetirlo crearia una
 * segunda verdad que se desincroniza en cuanto una de las dos cambie.
 */
@Controller('merchant-credit')
export class MerchantCreditGatewayController {
  constructor(private readonly client: AtlasPartnerClient) {}

  /** Lo que este comercio tiene esperando respuesta. Por defecto, solo lo pendiente. */
  @Get(':partnerId/applications')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'OPERATIONS', 'ADMIN')
  list(
    @Req() req: Request,
    @Param('partnerId') partnerId: string,
    @Query('onlyPending') onlyPending?: string,
  ) {
    const filtro = onlyPending === undefined ? '' : `?onlyPending=${encodeURIComponent(onlyPending)}`;
    return this.client.forward({
      method: 'GET',
      path: `merchant/partners/${encodeURIComponent(partnerId)}/credit-applications${filtro}`,
      accessToken: this.token(req),
    });
  }

  /**
   * Aceptar o rechazar. El cuerpo es `{ accepted, reasonCode?, notes? }` y no lleva importe ni
   * calendario: no hay nada que el comercio pueda cambiar de la operacion.
   */
  @Post(':partnerId/applications/:applicationId/acceptance')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'OPERATIONS', 'ADMIN')
  decide(
    @Req() req: Request,
    @Param('partnerId') partnerId: string,
    @Param('applicationId') applicationId: string,
    @Body() body: unknown,
  ) {
    return this.client.forward({
      method: 'POST',
      path:
        `merchant/partners/${encodeURIComponent(partnerId)}` +
        `/credit-applications/${encodeURIComponent(applicationId)}/acceptance`,
      accessToken: this.token(req),
      body,
    });
  }

  /**
   * Los comprobantes de transferencia que esperan la palabra del comercio.
   *
   * El dinero de una transferencia entra en SU cuenta, no en la de Atlas: es el unico que puede
   * decir si llego. Hasta ahora el comprobante se quedaba en el telefono del cliente.
   */
  @Get(':partnerId/payment-claims')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'OPERATIONS', 'ADMIN')
  listPaymentClaims(
    @Req() req: Request,
    @Param('partnerId') partnerId: string,
    @Query('onlyPending') onlyPending?: string,
  ) {
    const filtro = onlyPending === undefined ? '' : `?onlyPending=${encodeURIComponent(onlyPending)}`;
    return this.client.forward({
      method: 'GET',
      path: `merchant/partners/${encodeURIComponent(partnerId)}/payment-claims${filtro}`,
      accessToken: this.token(req),
    });
  }

  /** La cartera: que le deben, quien y cuando. Alimenta creditos, calendario y panel. */
  @Get(':partnerId/portfolio')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'OPERATIONS', 'ADMIN')
  portfolio(@Req() req: Request, @Param('partnerId') partnerId: string) {
    return this.client.forward({
      method: 'GET',
      path: `merchant/partners/${encodeURIComponent(partnerId)}/payment-claims/portfolio`,
      accessToken: this.token(req),
    });
  }

  /** Confirmar o rechazar. Al confirmar, AtlasBackend registra el pago del prestamo. */
  @Post(':partnerId/payment-claims/:claimId/verification')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'OPERATIONS', 'ADMIN')
  verifyPaymentClaim(
    @Req() req: Request,
    @Param('partnerId') partnerId: string,
    @Param('claimId') claimId: string,
    @Body() body: unknown,
  ) {
    return this.client.forward({
      method: 'POST',
      path:
        `merchant/partners/${encodeURIComponent(partnerId)}` +
        `/payment-claims/${encodeURIComponent(claimId)}/verification`,
      accessToken: this.token(req),
      body,
    });
  }

  private token(req: Request): string | undefined {
    return (req.cookies as Record<string, string> | undefined)?.[UPSTREAM_ACCESS_COOKIE];
  }
}
