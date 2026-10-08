import { ModerationRepository } from './moderation.repository';

describe('ModerationRepository.applyDecisionToTargets', () => {
  function construir() {
    const campaignModel = { update: jest.fn().mockResolvedValue([1]) };
    const adModel = { update: jest.fn().mockResolvedValue([1]), findByPk: jest.fn() };
    const adSetModel = { update: jest.fn().mockResolvedValue([1]) };
    const creativeModel = { update: jest.fn().mockResolvedValue([1]) };
    const logger = { setContext: jest.fn() };
    const repo = new ModerationRepository(
      { name: 'r' } as never,
      campaignModel as never,
      adModel as never,
      adSetModel as never,
      creativeModel as never,
      logger as never,
    );
    return { repo, campaignModel, creativeModel, adModel };
  }

  it('decidir la revisión de una creatividad NO toca la campaña', async () => {
    const { repo, campaignModel, creativeModel } = construir();
    await repo.applyDecisionToTargets(
      { campaignId: 'c1', creativeId: 'cr1', adId: null } as never,
      'APPROVED',
    );
    expect(campaignModel.update).not.toHaveBeenCalled();
    expect(creativeModel.update).toHaveBeenCalledTimes(1);
  });

  it('rechazar la revisión de un anuncio NO rechaza la campaña', async () => {
    const { repo, campaignModel, adModel } = construir();
    await repo.applyDecisionToTargets(
      { campaignId: 'c1', adId: 'ad1', creativeId: null } as never,
      'REJECTED',
    );
    expect(campaignModel.update).not.toHaveBeenCalled();
    expect(adModel.update).toHaveBeenCalledTimes(1);
  });

  it('decidir la revisión de la campaña sí actualiza la campaña', async () => {
    const { repo, campaignModel } = construir();
    await repo.applyDecisionToTargets(
      { campaignId: 'c1', adId: null, creativeId: null } as never,
      'APPROVED',
    );
    expect(campaignModel.update).toHaveBeenCalledWith(
      { approvalStatus: 'APPROVED', status: 'APPROVED' },
      expect.objectContaining({ where: { id: 'c1' } }),
    );
  });
});

describe('ModerationRepository.updateReviewDecision · decisiones simultáneas', () => {
  const valores = {
    decision: 'APPROVED',
    reasonCode: 'OK',
    reviewerUserId: 'u1',
    requiresAdvertiserChanges: false,
  };

  function construir(filasAfectadas: number) {
    const reviewModel = {
      name: 'r',
      update: jest.fn().mockResolvedValue([filasAfectadas]),
    };
    const repo = new ModerationRepository(
      reviewModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { setContext: jest.fn() } as never,
    );
    return { repo, reviewModel };
  }

  it('actualiza sólo si la revisión sigue PENDING_REVIEW', async () => {
    const { repo, reviewModel } = construir(1);
    const review = { id: 'rev-1', set: jest.fn() };
    await repo.updateReviewDecision(review as never, valores);
    expect(reviewModel.update).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'APPROVED' }),
      expect.objectContaining({ where: { id: 'rev-1', decision: 'PENDING_REVIEW' } }),
    );
  });

  it('si otra decisión ganó la carrera (0 filas) responde 409 y no la pisa', async () => {
    const { repo } = construir(0);
    const review = { id: 'rev-1', set: jest.fn() };
    await expect(repo.updateReviewDecision(review as never, valores)).rejects.toThrow(
      'ya decidida',
    );
    expect(review.set).not.toHaveBeenCalled();
  });
});
