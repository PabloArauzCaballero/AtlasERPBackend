import { PLAN_ID, actor, buildHarness } from '../portal.harness';

describe('PortalPlanCommandService', () => {
  describe('createPlan', () => {
    it('devuelve un conflicto de dominio cuando el código ya existe', async () => {
      const harness = buildHarness();
      harness.planModel.findOne.mockResolvedValue({ id: PLAN_ID } as never);

      await expect(
        harness.plans.createPlan(
          {
            code: 'GROWTH',
            name: 'Growth',
            tier: 'STANDARD',
            monthlyPrice: 0,
            cpmPrice: 3.2,
            cpcPrice: 1.9,
            currency: 'BOB',
            features: [],
            sortOrder: 1,
          },
          actor,
        ),
      ).rejects.toMatchObject({ response: { code: 'MERCHANT_PLAN_CODE_TAKEN' } });

      expect(harness.planModel.create).not.toHaveBeenCalled();
    });

    it('normaliza el precio a dos decimales y registra la acción de negocio', async () => {
      const harness = buildHarness();
      harness.planModel.create.mockResolvedValue({
        id: PLAN_ID,
        code: 'GROWTH',
        name: 'Growth',
        description: null,
        tier: 'STANDARD',
        monthlyPrice: '349.00',
        currency: 'BOB',
        features: [],
        status: 'ACTIVE',
        sortOrder: 1,
      } as never);

      const plan = await harness.plans.createPlan(
        {
          code: 'GROWTH',
          name: 'Growth',
          tier: 'STANDARD',
          monthlyPrice: 349,
          cpmPrice: 3.2,
          cpcPrice: 1.9,
          currency: 'BOB',
          features: [],
          sortOrder: 1,
        },
        actor,
      );

      expect(plan.monthlyPrice).toBe('349.00');
      expect(harness.planModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ monthlyPrice: '349.00', status: 'ACTIVE' }),
        expect.anything(),
      );
      expect(harness.businessActionLogs.record).toHaveBeenCalledWith(
        expect.objectContaining({ actionCode: 'CREATE_MERCHANT_PLAN', moduleCode: 'PORTAL' }),
      );
    });

    it('guarda las tarifas en micros, que es como cobra el motor de entrega', async () => {
      const harness = buildHarness();
      harness.planModel.create.mockResolvedValue({ id: PLAN_ID, code: 'GROWTH' } as never);

      await harness.plans.createPlan(
        {
          code: 'GROWTH',
          name: 'Crecimiento',
          tier: 'STANDARD',
          monthlyPrice: 0,
          /* Bs 2,50 el millar: en decimales, repartido entre mil impresiones, se redondearía a cero. */
          cpmPrice: 2.5,
          cpcPrice: 1.5,
          currency: 'BOB',
          features: [],
          sortOrder: 1,
        },
        actor,
      );

      expect(harness.planModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ cpmMicros: '2500000', cpcMicros: '1500000' }),
        expect.anything(),
      );
    });
  });

  describe('updatePlan', () => {
    function planDouble(overrides: Record<string, unknown> = {}) {
      const plan: Record<string, unknown> = {
        id: PLAN_ID,
        code: 'GROWTH',
        name: 'Crecimiento',
        description: null,
        tier: 'STANDARD',
        monthlyPrice: '0.00',
        cpmMicros: '4000000',
        cpcMicros: '2500000',
        currency: 'BOB',
        features: [],
        status: 'ACTIVE',
        sortOrder: 1,
        ...overrides,
      };
      plan.update = jest.fn(async (values: Record<string, unknown>) => {
        Object.assign(plan, values);
        return plan;
      });
      return plan;
    }

    it('cambia solo la tarifa enviada y deja el resto como estaba', async () => {
      const harness = buildHarness();
      const plan = planDouble();
      harness.planModel.findByPk.mockResolvedValue(plan as never);

      const updated = await harness.plans.updatePlan(PLAN_ID, { cpmPrice: 3.2 }, actor);

      expect(plan.cpmMicros).toBe('3200000');
      expect(plan.cpcMicros).toBe('2500000');
      expect(updated.cpmPrice).toBe('3.20');
    });

    it('deja el precio anterior en la bitácora: sin él, una factura pasada no se puede explicar', async () => {
      const harness = buildHarness();
      harness.planModel.findByPk.mockResolvedValue(planDouble() as never);

      await harness.plans.updatePlan(PLAN_ID, { cpmPrice: 3.2, cpcPrice: 1.9 }, actor);

      expect(harness.businessActionLogs.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actionCode: 'UPDATE_MERCHANT_PLAN_TARIFF',
          inputSummary: expect.objectContaining({
            before: expect.objectContaining({ cpmMicros: '4000000', cpcMicros: '2500000' }),
          }),
          outputSummary: expect.objectContaining({
            after: expect.objectContaining({ cpmMicros: '3200000', cpcMicros: '1900000' }),
          }),
        }),
      );
    });

    it('devuelve 404 de dominio cuando la tarifa no existe', async () => {
      const harness = buildHarness();
      harness.planModel.findByPk.mockResolvedValue(null as never);

      await expect(
        harness.plans.updatePlan(PLAN_ID, { cpmPrice: 3.2 }, actor),
      ).rejects.toMatchObject({ response: { code: 'MERCHANT_PLAN_NOT_FOUND' } });
    });
  });
});
