import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { env } from '../../config/env';
import { AtlasPartnerClient } from './atlas-partner.client';

/** Cookie del token de identidad upstream, la misma que emite el gateway de autenticación. */
const UPSTREAM_ACCESS_COOKIE = 'atlas_upstream_at';

/** Roles del comercio que pueden pedir ayuda. Es la puerta de ESTE backend, no la de AtlasBackend. */
const COMERCIO = ['merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS', 'ADMIN'] as const;

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

  private token(req: Request): string | undefined {
    return (req.cookies as Record<string, string> | undefined)?.[UPSTREAM_ACCESS_COOKIE];
  }

  @Get('merchant/support/faq')
  @Roles(...COMERCIO)
  faq(@Req() req: Request) {
    return this.client.forward({
      method: 'GET',
      path: 'merchant/support/faq',
      accessToken: this.token(req),
    });
  }

  @Get('merchant/support/knowledge/search')
  @Roles(...COMERCIO)
  buscar(@Req() req: Request, @Query('q') q: string) {
    return this.client.forward({
      method: 'GET',
      path: `merchant/support/knowledge/search?q=${encodeURIComponent(q ?? '')}`,
      accessToken: this.token(req),
    });
  }

  @Get('merchant/support/partners/:partnerProfileId/cases')
  @Roles(...COMERCIO)
  casos(@Req() req: Request, @Param('partnerProfileId') partnerProfileId: string) {
    return this.client.forward({
      method: 'GET',
      path: `merchant/support/partners/${encodeURIComponent(partnerProfileId)}/cases`,
      accessToken: this.token(req),
    });
  }

  @Get('merchant/support/cases/:caseId')
  @Roles(...COMERCIO)
  caso(@Req() req: Request, @Param('caseId') caseId: string) {
    return this.client.forward({
      method: 'GET',
      path: `merchant/support/cases/${encodeURIComponent(caseId)}`,
      accessToken: this.token(req),
    });
  }

  @Post('merchant/support/cases')
  @Roles(...COMERCIO)
  abrirCaso(@Req() req: Request, @Body() body: unknown) {
    return this.client.forward({
      method: 'POST',
      path: 'merchant/support/cases',
      accessToken: this.token(req),
      body,
    });
  }

  @Post('merchant/support/cases/:caseId/close-request')
  @Roles(...COMERCIO)
  pedirCierre(@Req() req: Request, @Param('caseId') caseId: string, @Body() body: unknown) {
    return this.client.forward({
      method: 'POST',
      path: `merchant/support/cases/${encodeURIComponent(caseId)}/close-request`,
      accessToken: this.token(req),
      body,
    });
  }

  @Post('merchant/support/cases/:caseId/feedback')
  @Roles(...COMERCIO)
  valorar(@Req() req: Request, @Param('caseId') caseId: string, @Body() body: unknown) {
    return this.client.forward({
      method: 'POST',
      path: `merchant/support/cases/${encodeURIComponent(caseId)}/feedback`,
      accessToken: this.token(req),
      body,
    });
  }

  @Post('support/channels')
  @Roles(...COMERCIO)
  abrirConversacion(@Req() req: Request, @Body() body: unknown) {
    return this.client.forward({
      method: 'POST',
      path: 'support/channels',
      accessToken: this.token(req),
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
      accessToken: this.token(req),
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
      accessToken: this.token(req),
    });
  }

  @Post('support/channels/:channelId/messages')
  @Roles(...COMERCIO)
  enviar(@Req() req: Request, @Param('channelId') channelId: string, @Body() body: unknown) {
    return this.client.forward({
      method: 'POST',
      path: `support/channels/${encodeURIComponent(channelId)}/messages`,
      accessToken: this.token(req),
      body,
    });
  }

  @Post('support/channels/:channelId/read')
  @Roles(...COMERCIO)
  marcarLeido(@Req() req: Request, @Param('channelId') channelId: string, @Body() body: unknown) {
    return this.client.forward({
      method: 'POST',
      path: `support/channels/${encodeURIComponent(channelId)}/read`,
      accessToken: this.token(req),
      body,
    });
  }

  @Post('support/channels/:channelId/typing')
  @Roles(...COMERCIO)
  escribiendo(@Req() req: Request, @Param('channelId') channelId: string) {
    return this.client.forward({
      method: 'POST',
      path: `support/channels/${encodeURIComponent(channelId)}/typing`,
      accessToken: this.token(req),
    });
  }

  @Post('support/channels/:channelId/close')
  @Roles(...COMERCIO)
  cerrar(@Req() req: Request, @Param('channelId') channelId: string, @Body() body: unknown) {
    return this.client.forward({
      method: 'POST',
      path: `support/channels/${encodeURIComponent(channelId)}/close`,
      accessToken: this.token(req),
      body,
    });
  }

  @Post('support/channels/:channelId/attachments/ticket')
  @Roles(...COMERCIO)
  ticketDeAdjunto(
    @Req() req: Request,
    @Param('channelId') channelId: string,
    @Body() body: unknown,
  ) {
    return this.client.forward({
      method: 'POST',
      path: `support/channels/${encodeURIComponent(channelId)}/attachments/ticket`,
      accessToken: this.token(req),
      body,
    });
  }

  /**
   * El archivo, como bytes.
   *
   * Reenvío binario y no `forward`: aquí no hay sobre `{ requestId, data }` que abrir, hay un
   * archivo. Servirlo por URL prefirmada del almacén habría creado un enlace que funciona sin
   * sesión y que queda en el historial del navegador.
   */
  @Get('support/attachments/:attachmentId/content')
  @Roles(...COMERCIO)
  async adjunto(
    @Req() req: Request,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    const archivo = await this.client.forwardBinary({
      method: 'GET',
      path: `support/attachments/${encodeURIComponent(attachmentId)}/content`,
      accessToken: this.token(req),
    });
    res.setHeader('Content-Type', archivo.contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(archivo.buffer);
  }

  /**
   * El hilo en vivo de la conversación (SSE), atravesando la pasarela.
   *
   * Se hace con `fetch` y no con el cliente de axios porque lo que hay que reenviar es un flujo que
   * no termina: `forward` espera la respuesta COMPLETA antes de devolver, y una respuesta que no
   * completa nunca dejaría al comercio esperando hasta el timeout. Aquí se conecta al upstream y se
   * van copiando los trozos según llegan.
   *
   * Si el navegador cierra la pestaña, se aborta la conexión de arriba: sin eso, cada pestaña
   * cerrada dejaría un stream vivo contra AtlasBackend consumiendo una conexión para nadie.
   */
  @Get('support/channels/:channelId/stream')
  @Roles(...COMERCIO)
  async hiloEnVivo(
    @Req() req: Request,
    @Param('channelId') channelId: string,
    @Res() res: Response,
  ) {
    const token = this.token(req);
    if (!token) {
      res
        .status(401)
        .json({ error: { code: 'UNAUTHORIZED', message: 'No hay sesión de identidad.' } });
      return;
    }

    const control = new AbortController();
    req.on('close', () => control.abort());

    const upstream = await fetch(
      `${env.ATLAS_IDENTITY_BASE_URL}/support/channels/${encodeURIComponent(channelId)}/stream`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-tenant-id': env.ATLAS_IDENTITY_TENANT_ID,
          Accept: 'text/event-stream',
        },
        signal: control.signal,
      },
    ).catch(() => null);

    if (!upstream?.ok || !upstream.body) {
      res
        .status(502)
        .json({
          error: {
            code: 'SUPPORT_STREAM_UNAVAILABLE',
            message: 'El hilo en vivo no está disponible.',
          },
        });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const lector = upstream.body.getReader();
    try {
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    } catch {
      // Cortar la conexión al cerrar la pestaña entra por aquí y no es un fallo.
    } finally {
      res.end();
    }
  }
}
