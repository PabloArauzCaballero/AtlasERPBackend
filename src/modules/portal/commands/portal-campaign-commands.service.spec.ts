import {
  CAMPAIGN_ID,
  actor,
  activeAdvertiser,
  buildHarness,
  campaignDouble,
  merchantScope,
} from '../portal.harness';

describe('PortalCampaignCommandService', () => {
  describe('setCampaignStatus', () => {
    it('no permite activar una campaña sin aprobación de moderación', async () => {
      const harness = buildHarness();
      harness.campaignModel.findByPk.mockResolvedValue(
        campaignDouble({ status: 'PAUSED', approvalStatus: 'REJECTED' }),
      );
      harness.advertiserModel.findByPk.mockResolvedValue(activeAdvertiser());

      await expect(
        harness.campaigns.setCampaignStatus(CAMPAIGN_ID, { status: 'ACTIVE' }, actor),
      ).rejects.toMatchObject({ response: { code: 'CAMPAIGN_NOT_APPROVED' } });

      expect(harness.auditService.record).not.toHaveBeenCalled();
    });

    it('no permite activar una campaña con el presupuesto agotado', async () => {
      const harness = buildHarness();
      harness.campaignModel.findByPk.mockResolvedValue(
        campaignDouble({ budgetTotalMicros: '1000000', spendTotalMicros: '1000000' }),
      );
      harness.advertiserModel.findByPk.mockResolvedValue(activeAdvertiser());

      await expect(
        harness.campaigns.setCampaignStatus(CAMPAIGN_ID, { status: 'ACTIVE' }, actor),
      ).rejects.toMatchObject({ response: { code: 'CAMPAIGN_BUDGET_EXHAUSTED' } });
    });

    it('no permite activar una campaña fuera de su ventana de vigencia', async () => {
      const harness = buildHarness();
      harness.campaignModel.findByPk.mockResolvedValue(
        campaignDouble({ endsAt: new Date('2020-01-01T00:00:00.000Z') }),
      );
      harness.advertiserModel.findByPk.mockResolvedValue(activeAdvertiser());

      await expect(
        harness.campaigns.setCampaignStatus(CAMPAIGN_ID, { status: 'ACTIVE' }, actor),
      ).rejects.toMatchObject({ response: { code: 'CAMPAIGN_SCHEDULE_EXPIRED' } });
    });

    it('no permite operar campañas de un anunciante suspendido o bloqueado por riesgo', async () => {
      const suspended = buildHarness();
      suspended.campaignModel.findByPk.mockResolvedValue(campaignDouble());
      suspended.advertiserModel.findByPk.mockResolvedValue(
        activeAdvertiser({ status: 'SUSPENDED' }),
      );
      await expect(
        suspended.campaigns.setCampaignStatus(CAMPAIGN_ID, { status: 'ACTIVE' }, actor),
      ).rejects.toMatchObject({ response: { code: 'ADVERTISER_NOT_ACTIVE' } });

      const blocked = buildHarness();
      blocked.campaignModel.findByPk.mockResolvedValue(campaignDouble());
      blocked.advertiserModel.findByPk.mockResolvedValue(
        activeAdvertiser({ riskStatus: 'BLOCKED' }),
      );
      await expect(
        blocked.campaigns.setCampaignStatus(CAMPAIGN_ID, { status: 'PAUSED' }, actor),
      ).rejects.toMatchObject({ response: { code: 'ADVERTISER_RISK_BLOCKED' } });
    });

    it('no permite tocar campañas que aún no se lanzaron', async () => {
      const harness = buildHarness();
      harness.campaignModel.findByPk.mockResolvedValue(campaignDouble({ status: 'DRAFT' }));
      harness.advertiserModel.findByPk.mockResolvedValue(activeAdvertiser());

      await expect(
        harness.campaigns.setCampaignStatus(CAMPAIGN_ID, { status: 'ACTIVE' }, actor),
      ).rejects.toMatchObject({ response: { code: 'CAMPAIGN_NOT_TOGGLEABLE' } });
    });

    it('verifica la propiedad del anunciante antes de cualquier otra comprobación', async () => {
      const harness = buildHarness();
      harness.campaignModel.findByPk.mockResolvedValue(campaignDouble());
      harness.scopeService.assertAdvertiserAccess.mockRejectedValue(
        Object.assign(new Error('forbidden'), { response: { code: 'ADVERTISER_FORBIDDEN' } }),
      );

      await expect(
        harness.campaigns.setCampaignStatus(CAMPAIGN_ID, { status: 'ACTIVE' }, actor),
      ).rejects.toMatchObject({ response: { code: 'ADVERTISER_FORBIDDEN' } });

      expect(harness.advertiserModel.findByPk).not.toHaveBeenCalled();
      expect(harness.auditService.record).not.toHaveBeenCalled();
    });

    it('activa una campaña válida y deja auditoría y bitácora en la misma transacción', async () => {
      const harness = buildHarness();
      const campaign = campaignDouble();
      harness.campaignModel.findByPk.mockResolvedValue(campaign);
      harness.advertiserModel.findByPk.mockResolvedValue(activeAdvertiser());

      const result = await harness.campaigns.setCampaignStatus(
        CAMPAIGN_ID,
        { status: 'ACTIVE' },
        actor,
      );

      expect(result.status).toBe('ACTIVE');
      expect(result.toggleable).toBe(true);

      // La fila se toma con bloqueo para no competir con la consola administrativa.
      expect(harness.campaignModel.findByPk).toHaveBeenCalledWith(
        CAMPAIGN_ID,
        expect.objectContaining({ lock: 'UPDATE' }),
      );

      expect(harness.auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorType: 'MERCHANT_PORTAL_USER',
          entityType: 'CAMPAIGN',
          action: 'PORTAL_UPDATE_CAMPAIGN_STATUS',
          before: expect.objectContaining({ status: 'PAUSED' }),
          after: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
      expect(harness.businessActionLogs.record).toHaveBeenCalledWith(
        expect.objectContaining({
          moduleCode: 'PORTAL',
          actionCode: 'PORTAL_UPDATE_CAMPAIGN_STATUS',
          aggregateId: CAMPAIGN_ID,
        }),
      );
    });

    it('es idempotente cuando la campaña ya está en el estado pedido', async () => {
      const harness = buildHarness();
      const campaign = campaignDouble({ status: 'ACTIVE' });
      harness.campaignModel.findByPk.mockResolvedValue(campaign);
      harness.advertiserModel.findByPk.mockResolvedValue(activeAdvertiser());

      const result = await harness.campaigns.setCampaignStatus(
        CAMPAIGN_ID,
        { status: 'ACTIVE' },
        actor,
      );

      expect(result.status).toBe('ACTIVE');
      expect(harness.auditService.record).not.toHaveBeenCalled();
      expect(harness.businessActionLogs.record).not.toHaveBeenCalled();
    });

    it('registra al staff interno con su propio tipo de actor', async () => {
      const harness = buildHarness();
      harness.campaignModel.findByPk.mockResolvedValue(campaignDouble());
      harness.advertiserModel.findByPk.mockResolvedValue(activeAdvertiser());

      await harness.campaigns.setCampaignStatus(
        CAMPAIGN_ID,
        { status: 'ACTIVE' },
        {
          ...actor,
          scope: { ...merchantScope, isInternalOperator: true },
        },
      );

      expect(harness.auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ actorType: 'INTERNAL_ATLAS_USER' }),
      );
    });
  });
});
