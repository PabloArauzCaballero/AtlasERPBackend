import { ACCOUNT_ID, OTHER_PLAN_ID, PLAN_ID, actor, buildHarness } from '../portal.harness';

describe('PortalSubscriptionCommandService', () => {
  describe('subscribe', () => {
    const account = { id: ACCOUNT_ID, lifecycleStatus: 'CUSTOMER' } as never;
    const plan = { id: PLAN_ID, status: 'ACTIVE' } as never;

    function subscriptionDouble(id: string) {
      return {
        id,
        merchantAccountId: ACCOUNT_ID,
        planId: PLAN_ID,
        status: 'ACTIVE',
        autoRenew: true,
        startedAt: new Date('2026-01-31T00:00:00.000Z'),
        currentPeriodEnd: new Date('2026-02-28T00:00:00.000Z'),
        endedAt: null,
        plan: null,
      } as never;
    }

    it('bloquea la cuenta antes de cerrar y crear la suscripción', async () => {
      const harness = buildHarness();
      harness.accountModel.findByPk.mockResolvedValue(account);
      harness.planModel.findByPk.mockResolvedValue(plan);
      harness.subscriptionModel.update.mockResolvedValue([1]);
      harness.subscriptionModel.create.mockResolvedValue({ id: 'sub-new' });
      harness.subscriptionModel.findByPk.mockResolvedValue(subscriptionDouble('sub-new'));

      await harness.subscriptions.subscribe({ planId: PLAN_ID, autoRenew: true }, actor);

      expect(harness.accountModel.findByPk).toHaveBeenCalledWith(
        ACCOUNT_ID,
        expect.objectContaining({ lock: 'UPDATE' }),
      );
      // La suscripción anterior se cierra con fecha, como exige la restricción de la tabla.
      expect(harness.subscriptionModel.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'REPLACED', endedAt: expect.any(Date) }),
        expect.objectContaining({ where: { merchantAccountId: ACCOUNT_ID, status: 'ACTIVE' } }),
      );
      expect(harness.businessActionLogs.record).toHaveBeenCalledWith(
        expect.objectContaining({ actionCode: 'SELECT_MERCHANT_PLAN' }),
      );
    });

    it('rechaza contratar con una cuenta fuera de estado comercial', async () => {
      const harness = buildHarness();
      harness.accountModel.findByPk.mockResolvedValue({
        id: ACCOUNT_ID,
        lifecycleStatus: 'TERMINATED',
      } as never);

      await expect(
        harness.subscriptions.subscribe({ planId: PLAN_ID, autoRenew: true }, actor),
      ).rejects.toMatchObject({ response: { code: 'MERCHANT_ACCOUNT_NOT_SUBSCRIBABLE' } });

      expect(harness.subscriptionModel.create).not.toHaveBeenCalled();
    });

    it('rechaza un plan inexistente o inactivo', async () => {
      const harness = buildHarness();
      harness.accountModel.findByPk.mockResolvedValue(account);
      harness.planModel.findByPk.mockResolvedValue({ id: PLAN_ID, status: 'INACTIVE' } as never);

      await expect(
        harness.subscriptions.subscribe({ planId: PLAN_ID, autoRenew: true }, actor),
      ).rejects.toMatchObject({ response: { code: 'MERCHANT_PLAN_NOT_AVAILABLE' } });
    });

    it('no reemplaza la suscripción cuando el plan y la renovación no cambian', async () => {
      const harness = buildHarness();
      harness.accountModel.findByPk.mockResolvedValue(account);
      harness.planModel.findByPk.mockResolvedValue(plan);
      harness.subscriptionModel.findOne.mockResolvedValue({
        id: 'sub-existing',
        planId: PLAN_ID,
        autoRenew: true,
      } as never);
      harness.subscriptionModel.findByPk.mockResolvedValue(subscriptionDouble('sub-existing'));

      const result = await harness.subscriptions.subscribe(
        { planId: PLAN_ID, autoRenew: true },
        actor,
      );

      expect(result.id).toBe('sub-existing');
      expect(harness.subscriptionModel.update).not.toHaveBeenCalled();
      expect(harness.subscriptionModel.create).not.toHaveBeenCalled();
    });

    it('registra el cambio de plan como tal cuando ya había una suscripción distinta', async () => {
      const harness = buildHarness();
      harness.accountModel.findByPk.mockResolvedValue(account);
      harness.planModel.findByPk.mockResolvedValue(plan);
      harness.subscriptionModel.findOne.mockResolvedValue({
        id: 'sub-old',
        planId: OTHER_PLAN_ID,
        autoRenew: true,
      } as never);
      harness.subscriptionModel.update.mockResolvedValue([1]);
      harness.subscriptionModel.create.mockResolvedValue({ id: 'sub-new' });
      harness.subscriptionModel.findByPk.mockResolvedValue(subscriptionDouble('sub-new'));

      await harness.subscriptions.subscribe({ planId: PLAN_ID, autoRenew: true }, actor);

      expect(harness.businessActionLogs.record).toHaveBeenCalledWith(
        expect.objectContaining({ actionCode: 'CHANGE_MERCHANT_PLAN' }),
      );
    });
  });
});
