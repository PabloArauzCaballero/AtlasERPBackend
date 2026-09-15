import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { AtlasPartnerClient } from '../partner-onboarding-gateway/atlas-partner.client';

/** Cookie del token de identidad upstream, la misma que emite el gateway de autenticación. */
const UPSTREAM_ACCESS_COOKIE = 'atlas_upstream_at';

/** Leer campañas: quien opera y quien audita. AtlasBackend vuelve a decidir con el rol del token. */
const LECTURA = ['ADMIN', 'OPERATIONS', 'COMMERCIAL_MANAGER', 'AUDITOR'] as const;
/** Crear, programar, pausar o cancelar: sólo administración. Es un envío masivo a clientes. */
const ESCRITURA = ['ADMIN'] as const;

const UPSTREAM = 'operations/notifications';
const QUERY_KEYS = ['page', 'limit', 'status', 'search', 'channel'] as const;

/**
 * Campañas de notificación a clientes, reenviadas a AtlasBackend.
 *
 * ## Por qué vive en el ERP y se ejecuta en AtlasBackend
 *
 * La consola desde la que se programa es el ERP, pero los destinatarios —clientes de la app, sus
 * dispositivos con avisos activos, sus correos verificados y su consentimiento— viven en
 * AtlasBackend, igual que los adaptadores de push (Firebase y APNs) y el planificador que arranca
 * una campaña a su hora. El ERP no tiene población de consumidores: su tabla `consumers_ref` es un
 * identificador opaco. Duplicar aquí el envío sería una segunda implementación sin nadie a quien
 * enviarle.
 *
 * ## Qué NO hace
 *
 * No valida el dominio (vocabulario de audiencia, ventana, transiciones): eso lo hace AtlasBackend y
 * su mensaje se conserva. Sí valida la FORMA de los identificadores de ruta, porque se interpolan en
 * la URL de otro servicio y un `../` ahí sería un salto a una ruta que nadie autorizó.
 */
@Controller('admin/notification-campaigns')
export class NotificationCampaignsGatewayController {
  constructor(private readonly client: AtlasPartnerClient) {}

  private token(req: Request): string | undefined {
    return (req.cookies as Record<string, string> | undefined)?.[UPSTREAM_ACCESS_COOKIE];
  }

  private idempotency(req: Request): Record<string, string> {
    const key = req.headers['x-idempotency-key'];
    return typeof key === 'string' && key.length > 0 ? { 'x-idempotency-key': key } : {};
  }

  private id(value: string): string {
    if (!/^[1-9][0-9]{0,18}$/.test(value ?? ''))
      throw new BadRequestException('Identificador inválido.');
    return value;
  }

  private query(query: Record<string, unknown>): string {
    const params = new URLSearchParams();
    for (const key of QUERY_KEYS) {
      const value = query[key];
      if (typeof value === 'string' && value.length > 0) params.set(key, value);
    }
    const text = params.toString();
    return text ? `?${text}` : '';
  }

  @Get('segments')
  @Roles(...LECTURA)
  segmentos(@Req() req: Request, @Query('status') status?: string) {
    const filtro = status === 'archived' ? '?status=archived' : '';
    return this.client.forward({
      method: 'GET',
      path: `${UPSTREAM}/audience-segments${filtro}`,
      accessToken: this.token(req),
    });
  }

  @Post('segments')
  @Roles(...ESCRITURA)
  crearSegmento(@Req() req: Request, @Body() body: unknown) {
    return this.client.forward({
      method: 'POST',
      path: `${UPSTREAM}/audience-segments`,
      accessToken: this.token(req),
      body,
    });
  }

  @Patch('segments/:segmentId')
  @Roles(...ESCRITURA)
  editarSegmento(
    @Req() req: Request,
    @Param('segmentId') segmentId: string,
    @Body() body: unknown,
  ) {
    return this.client.forward({
      method: 'PATCH',
      path: `${UPSTREAM}/audience-segments/${this.id(segmentId)}`,
      accessToken: this.token(req),
      body,
    });
  }

  @Post('audience/estimate')
  @HttpCode(HttpStatus.OK)
  @Roles(...LECTURA)
  estimar(@Req() req: Request, @Body() body: unknown) {
    return this.client.forward({
      method: 'POST',
      path: `${UPSTREAM}/campaigns/audience/estimate`,
      accessToken: this.token(req),
      body,
    });
  }

  @Get()
  @Roles(...LECTURA)
  listar(@Req() req: Request, @Query() query: Record<string, unknown>) {
    return this.client.forward({
      method: 'GET',
      path: `${UPSTREAM}/campaigns${this.query(query)}`,
      accessToken: this.token(req),
    });
  }

  @Post()
  @Roles(...ESCRITURA)
  crear(@Req() req: Request, @Body() body: unknown) {
    return this.client.forward({
      method: 'POST',
      path: `${UPSTREAM}/campaigns`,
      accessToken: this.token(req),
      body,
      headers: this.idempotency(req),
    });
  }

  @Get(':campaignId')
  @Roles(...LECTURA)
  detalle(@Req() req: Request, @Param('campaignId') campaignId: string) {
    return this.client.forward({
      method: 'GET',
      path: `${UPSTREAM}/campaigns/${this.id(campaignId)}`,
      accessToken: this.token(req),
    });
  }

  @Get(':campaignId/messages')
  @Roles(...LECTURA)
  avisos(
    @Req() req: Request,
    @Param('campaignId') campaignId: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.client.forward({
      method: 'GET',
      path: `${UPSTREAM}/campaigns/${this.id(campaignId)}/messages${this.query(query)}`,
      accessToken: this.token(req),
    });
  }

  @Patch(':campaignId')
  @Roles(...ESCRITURA)
  editar(@Req() req: Request, @Param('campaignId') campaignId: string, @Body() body: unknown) {
    return this.client.forward({
      method: 'PATCH',
      path: `${UPSTREAM}/campaigns/${this.id(campaignId)}`,
      accessToken: this.token(req),
      body,
    });
  }

  /** Programar, desprogramar, pausar, reanudar, cancelar, duplicar y probar: una ruta por verbo, igual que arriba. */
  @Post(':campaignId/:action')
  @HttpCode(HttpStatus.OK)
  @Roles(...ESCRITURA)
  accion(
    @Req() req: Request,
    @Param('campaignId') campaignId: string,
    @Param('action') action: string,
    @Body() body: unknown,
  ) {
    const acciones = [
      'schedule',
      'unschedule',
      'pause',
      'resume',
      'cancel',
      'duplicate',
      'test-send',
    ];
    if (!acciones.includes(action)) throw new BadRequestException('Acción desconocida.');
    return this.client.forward({
      method: 'POST',
      path: `${UPSTREAM}/campaigns/${this.id(campaignId)}/${action}`,
      accessToken: this.token(req),
      body: body ?? {},
      headers: this.idempotency(req),
    });
  }
}
