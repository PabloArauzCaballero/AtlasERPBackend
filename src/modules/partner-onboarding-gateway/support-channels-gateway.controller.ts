import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { AtlasPartnerClient } from './atlas-partner.client';
import { COMERCIO, upstreamAccessToken } from './partner-gateway.shared';

/**
 * Soporte del comercio, reenviado a AtlasBackend.
 *
 * ## Por qué existe este archivo
 *
 * Porque el navegador del comercio **nunca habla con AtlasBackend directamente**: sólo conoce este
 * origen, y el salto lo da el servidor. Es lo que permite exponer el portal por un túnel sin exponer
 * el backend de identidad. Un módulo nuevo no puede saltárselo; tiene que atravesarlo.
 *
 * Se descubrió probándolo de punta a punta: la pantalla de soporte cargaba y el botón «Hablar con
 * soporte» devolvía «No pudimos abrir la conversación», sin una sola línea en los logs de
 * AtlasBackend — porque la petición nunca llegaba hasta allí. El 404 lo daba este servicio.
 *
 * ## Qué NO hace
 *
 * No valida nada del dominio, igual que el resto de pasarelas de este módulo. Quien decide si un
 * comercio puede ver un caso es AtlasBackend, con el token del ACTOR: con una credencial de máquina
 * este gateway podría leer la conversación de cualquier comercio.
 */
@Controller()
export class SupportChannelsGatewayController {
  constructor(private readonly client: AtlasPartnerClient) {}

  @Post('support/channels')
  @Roles(...COMERCIO)
  abrirConversacion(@Req() req: Request, @Body() body: unknown) {
    return this.client.forward({
      method: 'POST',
      path: 'support/channels',
      accessToken: upstreamAccessToken(req),
      body,
    });
  }

  /** Los no leídos. Va ANTES de `:channelId` o «unread» encajaría en el parámetro. */
  @Get('support/channels/unread')
  @Roles(...COMERCIO)
  sinLeer(@Req() req: Request) {
    return this.client.forward({
      method: 'GET',
      path: 'support/channels/unread',
      accessToken: upstreamAccessToken(req),
    });
  }

  @Get('support/channels/:channelId/messages')
  @Roles(...COMERCIO)
  transcripcion(
    @Req() req: Request,
    @Param('channelId') channelId: string,
    @Query('afterSequence') afterSequence?: string,
    @Query('beforeSequence') beforeSequence?: string,
  ) {
    const parametros = new URLSearchParams();
    if (afterSequence) parametros.set('afterSequence', afterSequence);
    if (beforeSequence) parametros.set('beforeSequence', beforeSequence);
    const consulta = parametros.toString();
    return this.client.forward({
      method: 'GET',
      path: `support/channels/${encodeURIComponent(channelId)}/messages${consulta ? `?${consulta}` : ''}`,
      accessToken: upstreamAccessToken(req),
    });
  }

  @Post('support/channels/:channelId/messages')
  @Roles(...COMERCIO)
  enviar(@Req() req: Request, @Param('channelId') channelId: string, @Body() body: unknown) {
    return this.client.forward({
      method: 'POST',
      path: `support/channels/${encodeURIComponent(channelId)}/messages`,
      accessToken: upstreamAccessToken(req),
      body,
    });
  }

  @Post('support/channels/:channelId/read')
  @Roles(...COMERCIO)
  marcarLeido(@Req() req: Request, @Param('channelId') channelId: string, @Body() body: unknown) {
    return this.client.forward({
      method: 'POST',
      path: `support/channels/${encodeURIComponent(channelId)}/read`,
      accessToken: upstreamAccessToken(req),
      body,
    });
  }

  @Post('support/channels/:channelId/typing')
  @Roles(...COMERCIO)
  escribiendo(@Req() req: Request, @Param('channelId') channelId: string) {
    return this.client.forward({
      method: 'POST',
      path: `support/channels/${encodeURIComponent(channelId)}/typing`,
      accessToken: upstreamAccessToken(req),
    });
  }

  @Post('support/channels/:channelId/close')
  @Roles(...COMERCIO)
  cerrar(@Req() req: Request, @Param('channelId') channelId: string, @Body() body: unknown) {
    return this.client.forward({
      method: 'POST',
      path: `support/channels/${encodeURIComponent(channelId)}/close`,
      accessToken: upstreamAccessToken(req),
      body,
    });
  }
}
