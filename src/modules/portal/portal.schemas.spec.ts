import {
  advertisersQuerySchema,
  branchesQuerySchema,
  campaignsQuerySchema,
  createPlanSchema,
  plansQuerySchema,
  setCampaignStatusSchema,
  subscribeSchema,
  subscriptionQuerySchema,
} from './portal.schemas';
import { PORTAL_DEFAULT_PAGE_SIZE, PORTAL_MAX_PAGE_SIZE } from './portal.constants';

const uuid = '00000000-0000-0000-0000-000000000001';

const basePlan = {
  code: 'PREMIUM_1',
  name: 'Plan Premium',
  monthlyPrice: 199.9,
};

describe('Portal schemas', () => {
  describe('createPlanSchema', () => {
    it('aplica los valores por defecto de tier, moneda, features y orden', () => {
      const result = createPlanSchema.safeParse(basePlan);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toMatchObject({
        tier: 'STANDARD',
        currency: 'BOB',
        features: [],
        sortOrder: 0,
      });
    });

    it('rechaza códigos con minúsculas o separadores no admitidos', () => {
      expect(createPlanSchema.safeParse({ ...basePlan, code: 'premium_1' }).success).toBe(false);
      expect(createPlanSchema.safeParse({ ...basePlan, code: 'PREMIUM-1' }).success).toBe(false);
      expect(createPlanSchema.safeParse({ ...basePlan, code: 'P' }).success).toBe(false);
    });

    it('rechaza precios con más de dos decimales porque la columna es numeric(18,2)', () => {
      // Un flotante con tres decimales se redondearía en silencio contra el precio aprobado.
      expect(createPlanSchema.safeParse({ ...basePlan, monthlyPrice: 10.005 }).success).toBe(false);
      expect(createPlanSchema.safeParse({ ...basePlan, monthlyPrice: 10.5 }).success).toBe(true);
      expect(createPlanSchema.safeParse({ ...basePlan, monthlyPrice: -1 }).success).toBe(false);
    });

    it('normaliza la moneda a mayúsculas y exige un código ISO de tres letras', () => {
      const accepted = createPlanSchema.safeParse({ ...basePlan, currency: 'usd' });

      expect(accepted.success).toBe(true);
      if (accepted.success) expect(accepted.data.currency).toBe('USD');
      expect(createPlanSchema.safeParse({ ...basePlan, currency: 'US1' }).success).toBe(false);
      expect(createPlanSchema.safeParse({ ...basePlan, currency: 'BOBS' }).success).toBe(false);
    });

    it('acota el número de features', () => {
      const features = Array.from({ length: 41 }, (_, index) => `feature-${index}`);

      expect(createPlanSchema.safeParse({ ...basePlan, features }).success).toBe(false);
      expect(
        createPlanSchema.safeParse({ ...basePlan, features: features.slice(0, 40) }).success,
      ).toBe(true);
    });
  });

  describe('paginación de los listados', () => {
    it('aplica página y tamaño por defecto', () => {
      const result = branchesQuerySchema.safeParse({});

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toMatchObject({ page: 1, limit: PORTAL_DEFAULT_PAGE_SIZE });
    });

    it('coacciona los valores numéricos que llegan como texto en el query string', () => {
      const result = branchesQuerySchema.safeParse({ page: '3', limit: '10' });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toMatchObject({ page: 3, limit: 10 });
    });

    it('rechaza tamaños de página por encima del tope duro', () => {
      expect(branchesQuerySchema.safeParse({ limit: PORTAL_MAX_PAGE_SIZE }).success).toBe(true);
      expect(branchesQuerySchema.safeParse({ limit: PORTAL_MAX_PAGE_SIZE + 1 }).success).toBe(
        false,
      );
      expect(advertisersQuerySchema.safeParse({ limit: 1000 }).success).toBe(false);
      expect(branchesQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    });
  });

  describe('identificadores de alcance', () => {
    it('admite omitir la cuenta: el alcance del comercio se deriva de sus membresías', () => {
      expect(subscriptionQuerySchema.safeParse({}).success).toBe(true);
      expect(branchesQuerySchema.safeParse({}).success).toBe(true);
      expect(advertisersQuerySchema.safeParse({}).success).toBe(true);
    });

    it('rechaza identificadores que no son UUID en lugar de ignorarlos', () => {
      expect(subscriptionQuerySchema.safeParse({ merchantAccountId: 'todos' }).success).toBe(false);
      expect(branchesQuerySchema.safeParse({ accountId: '1' }).success).toBe(false);
      expect(advertisersQuerySchema.safeParse({ merchantAccountId: '' }).success).toBe(false);
    });

    it('exige el anunciante en el listado de campañas', () => {
      expect(campaignsQuerySchema.safeParse({}).success).toBe(false);
      expect(campaignsQuerySchema.safeParse({ advertiserId: uuid }).success).toBe(true);
    });
  });

  describe('subscribeSchema', () => {
    it('activa la renovación automática por defecto y exige un plan válido', () => {
      const result = subscribeSchema.safeParse({ planId: uuid });

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.autoRenew).toBe(true);
      expect(subscribeSchema.safeParse({}).success).toBe(false);
      expect(subscribeSchema.safeParse({ planId: 'plan-premium' }).success).toBe(false);
    });
  });

  describe('plansQuerySchema', () => {
    it('conserva includeInactive como enum textual para no cambiar el tipo de entrada', () => {
      const result = plansQuerySchema.safeParse({});

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.includeInactive).toBe('false');
      expect(plansQuerySchema.safeParse({ includeInactive: 'true' }).success).toBe(true);
      expect(plansQuerySchema.safeParse({ includeInactive: '1' }).success).toBe(false);
      expect(plansQuerySchema.safeParse({ includeInactive: true }).success).toBe(false);
    });
  });

  describe('setCampaignStatusSchema', () => {
    it('solo admite los estados que el comercio puede alternar', () => {
      expect(setCampaignStatusSchema.safeParse({ status: 'ACTIVE' }).success).toBe(true);
      expect(setCampaignStatusSchema.safeParse({ status: 'PAUSED' }).success).toBe(true);
      // Terminar o archivar una campaña no es una operación del portal.
      expect(setCampaignStatusSchema.safeParse({ status: 'ENDED' }).success).toBe(false);
      expect(setCampaignStatusSchema.safeParse({ status: 'ARCHIVED' }).success).toBe(false);
      expect(setCampaignStatusSchema.safeParse({ status: 'DRAFT' }).success).toBe(false);
    });

    it('exige un motivo con contenido cuando se envía', () => {
      expect(setCampaignStatusSchema.safeParse({ status: 'PAUSED', reason: 'corto' }).success).toBe(
        false,
      );

      const result = setCampaignStatusSchema.safeParse({
        status: 'PAUSED',
        reason: '  presupuesto agotado del mes  ',
      });

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.reason).toBe('presupuesto agotado del mes');
    });
  });
});
