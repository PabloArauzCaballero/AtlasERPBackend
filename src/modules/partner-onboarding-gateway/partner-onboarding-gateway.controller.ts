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
export class PartnerOnboardingGatewayController {
  constructor(private readonly client: AtlasPartnerClient) {}

  @Post('start')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  start(@Req() req: Request, @Body() body: unknown) {
    return this.client.forward({
      method: 'POST',
      path: 'partner-onboarding/start',
      accessToken: upstreamAccessToken(req),
      body,
    });
  }

  /* Cual es MI expediente. Va antes de `:partnerId/...` o `mine` encajaria en el parametro. */
  @Get('mine')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  mine(@Req() req: Request) {
    return this.client.forward({
      method: 'GET',
      path: 'partner-onboarding/mine',
      accessToken: upstreamAccessToken(req),
    });
  }

  @Get(':partnerId/status')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  status(@Req() req: Request, @Param('partnerId') partnerId: string) {
    return this.client.forward({
      method: 'GET',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/status`,
      accessToken: upstreamAccessToken(req),
    });
  }

  /** Corregir nombre de fachada, rubro y telefono. Admite el expediente ya aprobado. */
  @Patch(':partnerId/commercial-profile')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  updateCommercialProfile(
    @Req() req: Request,
    @Param('partnerId') partnerId: string,
    @Body() body: unknown,
  ) {
    return this.client.forward({
      method: 'PATCH',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/commercial-profile`,
      accessToken: upstreamAccessToken(req),
      body,
    });
  }

  /*
   * Los tres requisitos que el comercio no tenia por donde entregar.
   *
   * `mine` los enseñaba como pendientes —matricula de comercio, representante legal y su poder—
   * pero la pasarela no reenviaba las rutas que los reciben, asi que el expediente se quedaba
   * atascado en «falta» sin ninguna pantalla que lo pudiera resolver. Existian en AtlasBackend
   * desde el principio; lo que faltaba era el tramo del medio.
   */
  @Post(':partnerId/commercial-registry')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  setCommercialRegistry(
    @Req() req: Request,
    @Param('partnerId') partnerId: string,
    @Body() body: unknown,
  ) {
    return this.client.forward({
      method: 'POST',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/commercial-registry`,
      accessToken: upstreamAccessToken(req),
      body,
    });
  }

  @Post(':partnerId/legal-representative')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  addLegalRepresentative(
    @Req() req: Request,
    @Param('partnerId') partnerId: string,
    @Body() body: unknown,
  ) {
    return this.client.forward({
      method: 'POST',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/legal-representative`,
      accessToken: upstreamAccessToken(req),
      body,
    });
  }

  /** Permiso de subida del poder notarial. La ruta del objeto la impone AtlasBackend. */
  @Post(':partnerId/documents/upload-url')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  documentUploadUrl(
    @Req() req: Request,
    @Param('partnerId') partnerId: string,
    @Body() body: unknown,
  ) {
    return this.client.forward({
      method: 'POST',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/documents/upload-url`,
      accessToken: upstreamAccessToken(req),
      body,
    });
  }

  @Post(':partnerId/submit')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  submit(@Req() req: Request, @Param('partnerId') partnerId: string) {
    return this.client.forward({
      method: 'POST',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/submit`,
      accessToken: upstreamAccessToken(req),
    });
  }
}
