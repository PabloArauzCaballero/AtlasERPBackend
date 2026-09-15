import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { NotificationCampaignsGatewayController } from './notification-campaigns-gateway.controller';

/**
 * La pasarela de campañas reenvía cada ruta con el token del ACTOR, la clave de idempotencia del
 * navegador y sólo los parámetros de consulta conocidos. Y rechaza identificadores con forma rara
 * antes de interpolarlos en la URL de AtlasBackend.
 */
describe('NotificationCampaignsGatewayController', () => {
  function build(headers: Record<string, string> = {}) {
    const forward = jest.fn(async (input: unknown) => ({ ok: true, input }));
    const controller = new NotificationCampaignsGatewayController({ forward } as never);
    const req = {
      cookies: { atlas_upstream_at: 'token-del-actor' },
      headers,
    } as unknown as Request;
    return { controller, forward, req };
  }

  it('lista con sólo los filtros conocidos', async () => {
    const { controller, forward, req } = build();
    await controller.listar(req, { page: '2', status: 'running', inyectado: '../../x' });
    expect(forward).toHaveBeenCalledWith({
      method: 'GET',
      path: 'operations/notifications/campaigns?page=2&status=running',
      accessToken: 'token-del-actor',
    });
  });

  it('crear reenvía el cuerpo y la clave de idempotencia', async () => {
    const { controller, forward, req } = build({ 'x-idempotency-key': 'k-1' });
    await controller.crear(req, { name: 'x' });
    expect(forward).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: 'operations/notifications/campaigns',
        body: { name: 'x' },
        headers: { 'x-idempotency-key': 'k-1' },
      }),
    );
  });

  it('sin clave no inventa una: AtlasBackend responde 400', async () => {
    const { controller, forward, req } = build();
    await controller.crear(req, {});
    expect(forward).toHaveBeenCalledWith(expect.objectContaining({ headers: {} }));
  });

  it('las acciones van a su verbo y rechazan uno desconocido', async () => {
    const { controller, forward, req } = build({ 'x-idempotency-key': 'k-2' });
    await controller.accion(req, '7', 'schedule', undefined);
    expect(forward).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'operations/notifications/campaigns/7/schedule',
        body: {},
        headers: { 'x-idempotency-key': 'k-2' },
      }),
    );
    expect(() => controller.accion(req, '7', 'delete', {})).toThrow(BadRequestException);
  });

  it('rechaza identificadores que no son números antes de reenviar', () => {
    const { controller, forward, req } = build();
    expect(() => controller.detalle(req, '../admin')).toThrow(BadRequestException);
    expect(() => controller.editarSegmento(req, '1/../../x', {})).toThrow(BadRequestException);
    expect(forward).not.toHaveBeenCalled();
  });

  it.each([
    ['detalle', 'operations/notifications/campaigns/3'],
    ['avisos', 'operations/notifications/campaigns/3/messages?limit=5'],
  ] as const)('%s reenvía a %s', async (metodo, path) => {
    const { controller, forward, req } = build();
    if (metodo === 'detalle') await controller.detalle(req, '3');
    else await controller.avisos(req, '3', { limit: '5' });
    expect(forward).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET', path }));
  });

  it('segmentos, estimación y edición', async () => {
    const { controller, forward, req } = build();
    await controller.segmentos(req, 'archived');
    await controller.crearSegmento(req, { name: 's' });
    await controller.editarSegmento(req, '4', { status: 'archived' });
    await controller.estimar(req, { purpose: 'marketing' });
    await controller.editar(req, '3', { title: 't' });
    const paths = forward.mock.calls.map((call) => (call[0] as { path: string }).path);
    expect(paths).toEqual([
      'operations/notifications/audience-segments?status=archived',
      'operations/notifications/audience-segments',
      'operations/notifications/audience-segments/4',
      'operations/notifications/campaigns/audience/estimate',
      'operations/notifications/campaigns/3',
    ]);
  });
});
