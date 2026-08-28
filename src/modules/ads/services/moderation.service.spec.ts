import type { ConflictException, NotFoundException } from '@nestjs/common';
import { AdsModerationService } from './moderation.service';

/**
 * El envío a moderación es la pieza que cierra el circuito publicitario.
 *
 * Antes de existir, el módulo sabía crear campañas y sabía decidir revisiones, pero nada creaba
 * una revisión: `ad_moderation_reviews` no se llenaba por ninguna vía, la cola salía siempre vacía,
 * ninguna campaña alcanzaba `APPROVED` y `assertCampaignTransition` bloqueaba el paso a `ACTIVE`.
 * El efecto visible era un tablero de Ads con seis indicadores en cero que parecía falta de datos.
 * Estas pruebas fijan las tres reglas que impiden que vuelva a quedar sin salida — o con una salida
 * que se salte la revisión.
 */

interface Dobles {
  servicio: AdsModerationService;
  moderationRepository: {
    findAdsOfCampaign: jest.Mock;
    findPendingReviews: jest.Mock;
    createPendingReviews: jest.Mock;
    markSubmittedForReview: jest.Mock;
  };
  campaignsRepository: { findById: jest.Mock };
}

function construir(campana: Record<string, unknown> | null, anuncios: unknown[] = []): Dobles {
  const sequelize = { transaction: (fn: (t: unknown) => unknown) => fn('tx') };
  const moderationRepository = {
    findAdsOfCampaign: jest.fn().mockResolvedValue(anuncios),
    findPendingReviews: jest.fn().mockResolvedValue([]),
    createPendingReviews: jest
      .fn()
      .mockImplementation((filas: unknown[]) =>
        Promise.resolve(filas.map((_, indice) => ({ id: `rev-${indice}`, toJSON: () => ({}) }))),
      ),
    markSubmittedForReview: jest.fn().mockResolvedValue(undefined),
  };
  const campaignsRepository = { findById: jest.fn().mockResolvedValue(campana) };
  const auditService = { record: jest.fn().mockResolvedValue({ auditId: 'aud-1' }) };
  const logger = { setContext: jest.fn(), info: jest.fn(), debug: jest.fn() };

  const servicio = new AdsModerationService(
    sequelize as never,
    moderationRepository as never,
    campaignsRepository as never,
    auditService as never,
    logger as never,
  );
  return { servicio, moderationRepository, campaignsRepository };
}

const actor = {
  user: { sub: '00000000-0000-0000-0000-000000000001' },
  requestId: 'req-1',
} as never;
const entrada = { includeAds: true } as never;

async function codigoDeError(ejecutar: () => Promise<unknown>): Promise<string> {
  try {
    await ejecutar();
  } catch (error) {
    const respuesta = (error as ConflictException | NotFoundException).getResponse() as {
      code: string;
    };
    return respuesta.code;
  }
  throw new Error('Se esperaba un error y la operación fue aceptada.');
}

describe('AdsModerationService.submitCampaign', () => {
  it('crea una revisión pendiente por la campaña, cada anuncio y cada creatividad', async () => {
    // Tres piezas y dos creatividades distintas: 1 campaña + 3 anuncios + 2 creatividades = 6.
    // La creatividad repetida no genera una segunda revisión, porque decidir dos veces sobre la
    // misma pieza deja que la segunda decisión revierta a la primera.
    const anuncios = [
      { id: 'ad-1', creativeId: 'cre-1' },
      { id: 'ad-2', creativeId: 'cre-1' },
      { id: 'ad-3', creativeId: 'cre-2' },
    ];
    const { servicio, moderationRepository } = construir(
      { id: 'camp-1', advertiserId: 'adv-1', status: 'DRAFT', approvalStatus: 'NOT_SUBMITTED' },
      anuncios,
    );

    const resultado = (await servicio.submitCampaign('camp-1', entrada, actor)) as {
      reviewsCreated: number;
    };

    expect(resultado.reviewsCreated).toBe(6);
    const creadas = moderationRepository.createPendingReviews.mock.calls[0][0] as Array<
      Record<string, unknown>
    >;
    expect(
      creadas.filter((fila) => fila.campaignId && !fila.adId && !fila.creativeId),
    ).toHaveLength(1);
    expect(creadas.filter((fila) => fila.adId)).toHaveLength(3);
    expect(creadas.filter((fila) => fila.creativeId)).toHaveLength(2);
    expect(moderationRepository.markSubmittedForReview).toHaveBeenCalledWith(
      'camp-1',
      ['ad-1', 'ad-2', 'ad-3'],
      ['cre-1', 'cre-2'],
      'tx',
    );
  });

  it('no duplica revisiones al reenviar lo que ya está en la cola', async () => {
    const { servicio, moderationRepository } = construir(
      { id: 'camp-1', advertiserId: 'adv-1', status: 'DRAFT', approvalStatus: 'CHANGES_REQUESTED' },
      [{ id: 'ad-1', creativeId: 'cre-1' }],
    );
    moderationRepository.findPendingReviews.mockResolvedValue([
      { campaignId: 'camp-1', adId: null, creativeId: null },
      { campaignId: 'camp-1', adId: 'ad-1', creativeId: null },
    ]);

    const resultado = (await servicio.submitCampaign('camp-1', entrada, actor)) as {
      reviewsCreated: number;
    };

    // Sólo falta la creatividad: campaña y anuncio ya estaban pendientes.
    expect(resultado.reviewsCreated).toBe(1);
    const creadas = moderationRepository.createPendingReviews.mock.calls[0][0] as Array<
      Record<string, unknown>
    >;
    expect(creadas).toHaveLength(1);
    expect(creadas[0]?.creativeId).toBe('cre-1');
  });

  it('rechaza enviar una campaña que ya está en revisión, sin anuncios, terminal o inexistente', async () => {
    const enRevision = construir({
      id: 'camp-1',
      advertiserId: 'adv-1',
      status: 'PENDING_REVIEW',
      approvalStatus: 'PENDING',
    });
    expect(
      await codigoDeError(() => enRevision.servicio.submitCampaign('camp-1', entrada, actor)),
    ).toBe('CAMPAIGN_ALREADY_IN_REVIEW');

    // Aprobar una campaña sin anuncios no la hace entregable: la consulta de elegibilidad exige
    // anuncio aprobado, así que se avisa en vez de dejarla pasar a una cola que no sirve de nada.
    const sinAnuncios = construir(
      { id: 'camp-1', advertiserId: 'adv-1', status: 'DRAFT', approvalStatus: 'NOT_SUBMITTED' },
      [],
    );
    expect(
      await codigoDeError(() => sinAnuncios.servicio.submitCampaign('camp-1', entrada, actor)),
    ).toBe('CAMPAIGN_HAS_NO_ADS');

    for (const status of ['ENDED', 'ARCHIVED']) {
      const terminal = construir({
        id: 'camp-1',
        advertiserId: 'adv-1',
        status,
        approvalStatus: 'APPROVED',
      });
      expect(
        await codigoDeError(() => terminal.servicio.submitCampaign('camp-1', entrada, actor)),
      ).toBe('CAMPAIGN_IS_TERMINAL');
    }

    const inexistente = construir(null);
    expect(
      await codigoDeError(() => inexistente.servicio.submitCampaign('camp-1', entrada, actor)),
    ).toBe('CAMPAIGN_NOT_FOUND');
  });
});
