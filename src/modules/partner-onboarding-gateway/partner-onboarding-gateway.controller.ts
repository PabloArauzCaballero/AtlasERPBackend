import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
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
 */
@Controller('partner-onboarding')
export class PartnerOnboardingGatewayController {
  constructor(private readonly client: AtlasPartnerClient) {}

  @Post('start')
  @Roles('merchant', 'MERCHANT_OPERATIONS', 'ADMIN')
  start(@Req() req: Request, @Body() body: unknown) {
    return this.client.forward({ method: 'POST', path: 'partner-onboarding/start', accessToken: this.token(req), body });
  }

  @Get(':partnerId/status')
  @Roles('merchant', 'MERCHANT_OPERATIONS', 'ADMIN')
  status(@Req() req: Request, @Param('partnerId') partnerId: string) {
    return this.client.forward({
      method: 'GET',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/status`,
      accessToken: this.token(req),
    });
  }

  @Post(':partnerId/submit')
  @Roles('merchant', 'MERCHANT_OPERATIONS', 'ADMIN')
  submit(@Req() req: Request, @Param('partnerId') partnerId: string) {
    return this.client.forward({
      method: 'POST',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/submit`,
      accessToken: this.token(req),
    });
  }

  @Post(':partnerId/branches')
  @Roles('merchant', 'MERCHANT_OPERATIONS', 'ADMIN')
  registerBranch(@Req() req: Request, @Param('partnerId') partnerId: string, @Body() body: unknown) {
    return this.client.forward({
      method: 'POST',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/branches`,
      accessToken: this.token(req),
      body,
    });
  }

  @Get(':partnerId/branches')
  @Roles('merchant', 'MERCHANT_OPERATIONS', 'ADMIN')
  listBranches(@Req() req: Request, @Param('partnerId') partnerId: string) {
    return this.client.forward({
      method: 'GET',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/branches`,
      accessToken: this.token(req),
    });
  }

  @Post(':partnerId/qr-codes/upload-url')
  @Roles('merchant', 'MERCHANT_OPERATIONS', 'ADMIN')
  qrUploadUrl(@Req() req: Request, @Param('partnerId') partnerId: string, @Body() body: unknown) {
    return this.client.forward({
      method: 'POST',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/qr-codes/upload-url`,
      accessToken: this.token(req),
      body,
    });
  }

  @Post(':partnerId/qr-codes')
  @Roles('merchant', 'MERCHANT_OPERATIONS', 'ADMIN')
  registerQr(@Req() req: Request, @Param('partnerId') partnerId: string, @Body() body: unknown) {
    return this.client.forward({
      method: 'POST',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/qr-codes`,
      accessToken: this.token(req),
      body,
    });
  }

  @Get(':partnerId/qr-codes')
  @Roles('merchant', 'MERCHANT_OPERATIONS', 'ADMIN')
  listQr(@Req() req: Request, @Param('partnerId') partnerId: string) {
    return this.client.forward({
      method: 'GET',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/qr-codes`,
      accessToken: this.token(req),
    });
  }

  @Post(':partnerId/branches/:branchId/pos-terminals')
  @Roles('merchant', 'MERCHANT_OPERATIONS', 'ADMIN')
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
  @Roles('merchant', 'MERCHANT_OPERATIONS', 'ADMIN')
  listPos(@Req() req: Request, @Param('partnerId') partnerId: string) {
    return this.client.forward({
      method: 'GET',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/pos-terminals`,
      accessToken: this.token(req),
    });
  }

  @Patch(':partnerId/pos-terminals/:terminalId')
  @Roles('merchant', 'MERCHANT_OPERATIONS', 'ADMIN')
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
