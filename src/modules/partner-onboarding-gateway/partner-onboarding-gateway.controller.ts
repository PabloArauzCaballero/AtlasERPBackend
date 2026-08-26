import { Body, Controller, Get, Header, Param, Patch, Post, Req, Res, StreamableFile } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { AtlasPartnerClient } from './atlas-partner.client';

/**
 * Cookie del token de identidad upstream. Es la MISMA que emite el gateway de autenticación; aquí
 * sólo se lee.
 */
const UPSTREAM_ACCESS_COOKIE = 'atlas_upstream_at';

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
    return this.client.forward({ method: 'POST', path: 'partner-onboarding/start', accessToken: this.token(req), body });
  }

  /* Cual es MI expediente. Va antes de `:partnerId/...` o `mine` encajaria en el parametro. */
  @Get('mine')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  mine(@Req() req: Request) {
    return this.client.forward({
      method: 'GET',
      path: 'partner-onboarding/mine',
      accessToken: this.token(req),
    });
  }

  @Get(':partnerId/status')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  status(@Req() req: Request, @Param('partnerId') partnerId: string) {
    return this.client.forward({
      method: 'GET',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/status`,
      accessToken: this.token(req),
    });
  }

  /** Corregir nombre de fachada, rubro y telefono. Admite el expediente ya aprobado. */
  @Patch(':partnerId/commercial-profile')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  updateCommercialProfile(@Req() req: Request, @Param('partnerId') partnerId: string, @Body() body: unknown) {
    return this.client.forward({
      method: 'PATCH',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/commercial-profile`,
      accessToken: this.token(req),
      body,
    });
  }

  @Post(':partnerId/submit')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  submit(@Req() req: Request, @Param('partnerId') partnerId: string) {
    return this.client.forward({
      method: 'POST',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/submit`,
      accessToken: this.token(req),
    });
  }

  @Post(':partnerId/branches')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  registerBranch(@Req() req: Request, @Param('partnerId') partnerId: string, @Body() body: unknown) {
    return this.client.forward({
      method: 'POST',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/branches`,
      accessToken: this.token(req),
      body,
    });
  }

  @Get(':partnerId/branches')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  listBranches(@Req() req: Request, @Param('partnerId') partnerId: string) {
    return this.client.forward({
      method: 'GET',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/branches`,
      accessToken: this.token(req),
    });
  }

  @Post(':partnerId/qr-codes/upload-url')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  qrUploadUrl(@Req() req: Request, @Param('partnerId') partnerId: string, @Body() body: unknown) {
    return this.client.forward({
      method: 'POST',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/qr-codes/upload-url`,
      accessToken: this.token(req),
      body,
    });
  }

  @Post(':partnerId/qr-codes')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  registerQr(@Req() req: Request, @Param('partnerId') partnerId: string, @Body() body: unknown) {
    return this.client.forward({
      method: 'POST',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/qr-codes`,
      accessToken: this.token(req),
      body,
    });
  }

  @Get(':partnerId/qr-codes')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  listQr(@Req() req: Request, @Param('partnerId') partnerId: string) {
    return this.client.forward({
      method: 'GET',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/qr-codes`,
      accessToken: this.token(req),
    });
  }

  /**
   * La imagen del QR, para poder mirar lo que se subió.
   *
   * La lista de arriba devuelve el prefijo del hash, que prueba que el archivo existe pero no deja
   * ver si es el QR correcto. Un comercio que sube la imagen equivocada no se entera hasta que un
   * cliente transfiere a la cuenta de otro.
   */
  @Get(':partnerId/qr-codes/:qrId/content')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  @Header('Cache-Control', 'private, max-age=60')
  async qrContent(
    @Req() req: Request,
    @Param('partnerId') partnerId: string,
    @Param('qrId') qrId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const imagen = await this.client.forwardBinary({
      method: 'GET',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/qr-codes/${encodeURIComponent(qrId)}/content`,
      accessToken: this.token(req),
    });
    res.setHeader('Content-Type', imagen.contentType);
    return new StreamableFile(imagen.buffer);
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
      accessToken: this.token(req),
      body,
    });
  }

  @Get(':partnerId/pos-terminals')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  listPos(@Req() req: Request, @Param('partnerId') partnerId: string) {
    return this.client.forward({
      method: 'GET',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/pos-terminals`,
      accessToken: this.token(req),
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
      accessToken: this.token(req),
      body,
    });
  }

  private token(req: Request): string | undefined {
    return (req.cookies as Record<string, string> | undefined)?.[UPSTREAM_ACCESS_COOKIE];
  }
}
