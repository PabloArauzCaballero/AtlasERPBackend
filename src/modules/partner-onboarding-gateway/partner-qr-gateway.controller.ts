import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { AtlasPartnerClient } from './atlas-partner.client';
import { REAUTH_TOKEN_HEADER, upstreamAccessToken } from './partner-gateway.shared';

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
export class PartnerQrGatewayController {
  constructor(private readonly client: AtlasPartnerClient) {}

  @Post(':partnerId/qr-codes/upload-url')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  qrUploadUrl(@Req() req: Request, @Param('partnerId') partnerId: string, @Body() body: unknown) {
    return this.client.forward({
      method: 'POST',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/qr-codes/upload-url`,
      accessToken: upstreamAccessToken(req),
      body,
    });
  }

  @Post(':partnerId/qr-codes')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  registerQr(@Req() req: Request, @Param('partnerId') partnerId: string, @Body() body: unknown) {
    // ERP-03: AtlasBackend exige al comercio la prueba de reautenticación para cambiar su cuenta de
    // cobro. Se reenvía la cabecera tal cual; sin ella, AtlasBackend responde 403 REAUTH_REQUIRED.
    const reauthToken = req.headers[REAUTH_TOKEN_HEADER];
    return this.client.forward({
      method: 'POST',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/qr-codes`,
      accessToken: upstreamAccessToken(req),
      body,
      ...(typeof reauthToken === 'string' && reauthToken
        ? { headers: { [REAUTH_TOKEN_HEADER]: reauthToken } }
        : {}),
    });
  }

  @Get(':partnerId/qr-codes')
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN')
  listQr(@Req() req: Request, @Param('partnerId') partnerId: string) {
    return this.client.forward({
      method: 'GET',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/qr-codes`,
      accessToken: upstreamAccessToken(req),
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
      accessToken: upstreamAccessToken(req),
    });
    res.setHeader('Content-Type', imagen.contentType);
    return new StreamableFile(imagen.buffer);
  }
}
