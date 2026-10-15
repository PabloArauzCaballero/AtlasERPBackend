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
export class SupportGatewayController {
  constructor(private readonly client: AtlasPartnerClient) {}

  @Get('merchant/support/faq')
  @Roles(...COMERCIO)
  faq(@Req() req: Request) {
    return this.client.forward({
      method: 'GET',
      path: 'merchant/support/faq',
      accessToken: upstreamAccessToken(req),
    });
  }

  /**
   * Los motivos por los que el comercio puede abrir un caso.
   *
   * Faltaba. AtlasBackend publica `GET /merchant/support/categories` desde el principio, pero esta
   * pasarela no la reenviaba y el navegador nunca habla con AtlasBackend directo: el 404 lo daba
   * este servicio, la pantalla lo tragaba con un `.catch` y el panel «¿Sobre qué es?» salía siempre
   * vacío, así que toda conversación nacía sin clasificar y caía en la cola genérica.
   */
  @Get('merchant/support/categories')
  @Roles(...COMERCIO)
  motivos(@Req() req: Request) {
    return this.client.forward({
      method: 'GET',
      path: 'merchant/support/categories',
      accessToken: upstreamAccessToken(req),
    });
  }

  @Get('merchant/support/knowledge/search')
  @Roles(...COMERCIO)
  buscar(@Req() req: Request, @Query('q') q: string) {
    return this.client.forward({
      method: 'GET',
      path: `merchant/support/knowledge/search?q=${encodeURIComponent(q ?? '')}`,
      accessToken: upstreamAccessToken(req),
    });
  }

  @Get('merchant/support/partners/:partnerProfileId/cases')
  @Roles(...COMERCIO)
  casos(@Req() req: Request, @Param('partnerProfileId') partnerProfileId: string) {
    return this.client.forward({
      method: 'GET',
      path: `merchant/support/partners/${encodeURIComponent(partnerProfileId)}/cases`,
      accessToken: upstreamAccessToken(req),
    });
  }

  @Get('merchant/support/cases/:caseId')
  @Roles(...COMERCIO)
  caso(@Req() req: Request, @Param('caseId') caseId: string) {
    return this.client.forward({
      method: 'GET',
      path: `merchant/support/cases/${encodeURIComponent(caseId)}`,
      accessToken: upstreamAccessToken(req),
    });
  }

  @Post('merchant/support/cases')
  @Roles(...COMERCIO)
  abrirCaso(@Req() req: Request, @Body() body: unknown) {
    return this.client.forward({
      method: 'POST',
      path: 'merchant/support/cases',
      accessToken: upstreamAccessToken(req),
      body,
    });
  }

  @Post('merchant/support/cases/:caseId/close-request')
  @Roles(...COMERCIO)
  pedirCierre(@Req() req: Request, @Param('caseId') caseId: string, @Body() body: unknown) {
    return this.client.forward({
      method: 'POST',
      path: `merchant/support/cases/${encodeURIComponent(caseId)}/close-request`,
      accessToken: upstreamAccessToken(req),
      body,
    });
  }

  @Post('merchant/support/cases/:caseId/feedback')
  @Roles(...COMERCIO)
  valorar(@Req() req: Request, @Param('caseId') caseId: string, @Body() body: unknown) {
    return this.client.forward({
      method: 'POST',
      path: `merchant/support/cases/${encodeURIComponent(caseId)}/feedback`,
      accessToken: upstreamAccessToken(req),
      body,
    });
  }
}
