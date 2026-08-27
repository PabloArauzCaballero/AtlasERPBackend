import { Op } from 'sequelize';
import { PortalService, type PortalActor } from './portal.service';
import type { PortalScope } from './portal.scope.service';
import type { AuthUser } from '../../common/types/auth-context.types';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const PLAN_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_PLAN_ID = '66666666-6666-4666-8666-666666666666';
const CAMPAIGN_ID = '44444444-4444-4444-8444-444444444444';
const ADVERTISER_ID = '55555555-5555-4555-8555-555555555555';

const user: AuthUser = { sub: USER_ID, roles: ['MERCHANT_ADMIN'], role: 'MERCHANT_ADMIN' };

const merchantScope: PortalScope = {
  isInternalOperator: false,
  accountIds: [ACCOUNT_ID],
  userId: USER_ID,
  email: 'partner@comercio.bo',
  roles: ['MERCHANT_ADMIN'],
};

const actor: PortalActor = {
  user,
  requestId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  scope: merchantScope,
};

/** Transacción simulada: ejecuta la retrollamada y expone el modo de bloqueo usado. */
function fakeSequelize(queryRows: unknown[] = []) {
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  return {
    transaction: jest.fn(async (callback: (t: unknown) => Promise<unknown>) =>
      callback(transaction),
    ),
    query: jest.fn().mockResolvedValue(queryRows),
    __transaction: transaction,
  };
}

interface Harness {
  service: PortalService;
  sequelize: ReturnType<typeof fakeSequelize>;
  scopeService: {
    resolveScope: jest.Mock;
    resolveAccountId: jest.Mock;
    assertAccountAccess: jest.Mock;
    resolveAccessibleAdvertiserIds: jest.Mock;
    assertAdvertiserAccess: jest.Mock;
  };
  auditService: { record: jest.Mock };
  businessActionLogs: { record: jest.Mock };
  planModel: { findAll: jest.Mock; findOne: jest.Mock; findByPk: jest.Mock; create: jest.Mock };
  billingProductModel: { findAll: jest.Mock };
  subscriptionModel: {
    findOne: jest.Mock;
    findByPk: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
  };
  branchModel: { findAll: jest.Mock };
  accountModel: { findByPk: jest.Mock; findAll: jest.Mock };
  invoiceModel: { findAll: jest.Mock };
  receivableModel: { findAll: jest.Mock };
  advertiserModel: { findAll: jest.Mock; findByPk: jest.Mock };
  campaignModel: { findAll: jest.Mock; findByPk: jest.Mock };
}

function buildHarness(queryRows: unknown[] = []): Harness {
  const sequelize = fakeSequelize(queryRows);
  const logger = {
    infoContext: jest.fn(),
    warnContext: jest.fn(),
    debugContext: jest.fn(),
    errorContext: jest.fn(),
  };
  const scopeService = {
    resolveScope: jest.fn().mockResolvedValue(merchantScope),
    resolveAccountId: jest.fn((_scope: PortalScope, requested?: string) => requested ?? ACCOUNT_ID),
    assertAccountAccess: jest.fn(),
    resolveAccessibleAdvertiserIds: jest.fn().mockResolvedValue([ADVERTISER_ID]),
    assertAdvertiserAccess: jest.fn().mockResolvedValue(undefined),
  };
  const auditService = { record: jest.fn().mockResolvedValue({ auditId: 'audit-1' }) };
  const businessActionLogs = { record: jest.fn().mockResolvedValue(undefined) };
  const planModel = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findByPk: jest.fn(),
    create: jest.fn(),
  };
  const billingProductModel = { findAll: jest.fn().mockResolvedValue([]) };
  const subscriptionModel = {
    findOne: jest.fn().mockResolvedValue(null),
    findByPk: jest.fn(),
    update: jest.fn().mockResolvedValue([0]),
    create: jest.fn(),
  };
  const branchModel = { findAll: jest.fn().mockResolvedValue([]) };
  /* El usuario de comercio detras del `sub` del token: es lo que se guarda como actor. */
  const merchantUserModel = { findOne: jest.fn().mockResolvedValue({ id: 'b1000000-0000-4000-8000-000000000001' }) };
  const accountModel = { findByPk: jest.fn(), findAll: jest.fn().mockResolvedValue([]) };
  const invoiceModel = { findAll: jest.fn().mockResolvedValue([]) };
  const receivableModel = { findAll: jest.fn().mockResolvedValue([]) };
  const advertiserModel = { findAll: jest.fn().mockResolvedValue([]), findByPk: jest.fn() };
  const campaignModel = { findAll: jest.fn().mockResolvedValue([]), findByPk: jest.fn() };

  const service = new PortalService(
    sequelize as never,
    logger as never,
    scopeService as never,
    auditService as never,
    businessActionLogs as never,
    planModel as never,
    billingProductModel as never,
    subscriptionModel as never,
    branchModel as never,
    merchantUserModel as never,
    accountModel as never,
    invoiceModel as never,
    receivableModel as never,
    advertiserModel as never,
    campaignModel as never,
  );

  return {
    service,
    sequelize,
    scopeService,
    auditService,
    businessActionLogs,
    planModel,
    billingProductModel,
    subscriptionModel,
    branchModel,
    accountModel,
    invoiceModel,
    receivableModel,
    advertiserModel,
    campaignModel,
  };
}

/** Doble de un modelo Sequelize: `update` muta la propia instancia, como hace el real. */
function campaignDouble(overrides: Record<string, unknown> = {}) {
  const campaign: Record<string, unknown> = {
    id: CAMPAIGN_ID,
    advertiserId: ADVERTISER_ID,
    name: 'Campaña verano',
    objective: 'AWARENESS',
    status: 'PAUSED',
    approvalStatus: 'APPROVED',
    currency: 'BOB',
    budgetTotalMicros: '1000000000',
    budgetDailyMicros: null,
    spendTotalMicros: '10000000',
    startsAt: new Date('2026-01-01T00:00:00.000Z'),
    endsAt: null,
    ...overrides,
  };

  campaign.get = () => {
    const { get, update, ...attributes } = campaign;
    void get;
    void update;
    return attributes;
  };
  campaign.update = jest.fn(async (values: Record<string, unknown>) => {
    Object.assign(campaign, values);
    return campaign;
  });

  return campaign as never;
}

function activeAdvertiser(overrides: Record<string, unknown> = {}) {
  return {
    id: ADVERTISER_ID,
    merchantAccountId: ACCOUNT_ID,
    legalName: 'Comercio SRL',
    tradeName: 'Comercio',
    status: 'ACTIVE',
    riskStatus: 'NORMAL',
    billingMode: 'POSTPAID',
    currency: 'BOB',
    city: null,
    businessCategory: null,
    ...overrides,
  } as never;
}

describe('PortalService', () => {
  describe('setCampaignStatus', () => {
    it('no permite activar una campaña sin aprobación de moderación', async () => {
      const harness = buildHarness();
      harness.campaignModel.findByPk.mockResolvedValue(
        campaignDouble({ status: 'PAUSED', approvalStatus: 'REJECTED' }),
      );
      harness.advertiserModel.findByPk.mockResolvedValue(activeAdvertiser());

      await expect(
        harness.service.setCampaignStatus(CAMPAIGN_ID, { status: 'ACTIVE' }, actor),
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
        harness.service.setCampaignStatus(CAMPAIGN_ID, { status: 'ACTIVE' }, actor),
      ).rejects.toMatchObject({ response: { code: 'CAMPAIGN_BUDGET_EXHAUSTED' } });
    });

    it('no permite activar una campaña fuera de su ventana de vigencia', async () => {
      const harness = buildHarness();
      harness.campaignModel.findByPk.mockResolvedValue(
        campaignDouble({ endsAt: new Date('2020-01-01T00:00:00.000Z') }),
      );
      harness.advertiserModel.findByPk.mockResolvedValue(activeAdvertiser());

      await expect(
        harness.service.setCampaignStatus(CAMPAIGN_ID, { status: 'ACTIVE' }, actor),
      ).rejects.toMatchObject({ response: { code: 'CAMPAIGN_SCHEDULE_EXPIRED' } });
    });

    it('no permite operar campañas de un anunciante suspendido o bloqueado por riesgo', async () => {
      const suspended = buildHarness();
      suspended.campaignModel.findByPk.mockResolvedValue(campaignDouble());
      suspended.advertiserModel.findByPk.mockResolvedValue(
        activeAdvertiser({ status: 'SUSPENDED' }),
      );
      await expect(
        suspended.service.setCampaignStatus(CAMPAIGN_ID, { status: 'ACTIVE' }, actor),
      ).rejects.toMatchObject({ response: { code: 'ADVERTISER_NOT_ACTIVE' } });

      const blocked = buildHarness();
      blocked.campaignModel.findByPk.mockResolvedValue(campaignDouble());
      blocked.advertiserModel.findByPk.mockResolvedValue(
        activeAdvertiser({ riskStatus: 'BLOCKED' }),
      );
      await expect(
        blocked.service.setCampaignStatus(CAMPAIGN_ID, { status: 'PAUSED' }, actor),
      ).rejects.toMatchObject({ response: { code: 'ADVERTISER_RISK_BLOCKED' } });
    });

    it('no permite tocar campañas que aún no se lanzaron', async () => {
      const harness = buildHarness();
      harness.campaignModel.findByPk.mockResolvedValue(campaignDouble({ status: 'DRAFT' }));
      harness.advertiserModel.findByPk.mockResolvedValue(activeAdvertiser());

      await expect(
        harness.service.setCampaignStatus(CAMPAIGN_ID, { status: 'ACTIVE' }, actor),
      ).rejects.toMatchObject({ response: { code: 'CAMPAIGN_NOT_TOGGLEABLE' } });
    });

    it('verifica la propiedad del anunciante antes de cualquier otra comprobación', async () => {
      const harness = buildHarness();
      harness.campaignModel.findByPk.mockResolvedValue(campaignDouble());
      harness.scopeService.assertAdvertiserAccess.mockRejectedValue(
        Object.assign(new Error('forbidden'), { response: { code: 'ADVERTISER_FORBIDDEN' } }),
      );

      await expect(
        harness.service.setCampaignStatus(CAMPAIGN_ID, { status: 'ACTIVE' }, actor),
      ).rejects.toMatchObject({ response: { code: 'ADVERTISER_FORBIDDEN' } });

      expect(harness.advertiserModel.findByPk).not.toHaveBeenCalled();
      expect(harness.auditService.record).not.toHaveBeenCalled();
    });

    it('activa una campaña válida y deja auditoría y bitácora en la misma transacción', async () => {
      const harness = buildHarness();
      const campaign = campaignDouble();
      harness.campaignModel.findByPk.mockResolvedValue(campaign);
      harness.advertiserModel.findByPk.mockResolvedValue(activeAdvertiser());

      const result = await harness.service.setCampaignStatus(
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

      const result = await harness.service.setCampaignStatus(
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

      await harness.service.setCampaignStatus(
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

      await harness.service.subscribe({ planId: PLAN_ID, autoRenew: true }, actor);

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
        harness.service.subscribe({ planId: PLAN_ID, autoRenew: true }, actor),
      ).rejects.toMatchObject({ response: { code: 'MERCHANT_ACCOUNT_NOT_SUBSCRIBABLE' } });

      expect(harness.subscriptionModel.create).not.toHaveBeenCalled();
    });

    it('rechaza un plan inexistente o inactivo', async () => {
      const harness = buildHarness();
      harness.accountModel.findByPk.mockResolvedValue(account);
      harness.planModel.findByPk.mockResolvedValue({ id: PLAN_ID, status: 'INACTIVE' } as never);

      await expect(
        harness.service.subscribe({ planId: PLAN_ID, autoRenew: true }, actor),
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

      const result = await harness.service.subscribe({ planId: PLAN_ID, autoRenew: true }, actor);

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

      await harness.service.subscribe({ planId: PLAN_ID, autoRenew: true }, actor);

      expect(harness.businessActionLogs.record).toHaveBeenCalledWith(
        expect.objectContaining({ actionCode: 'CHANGE_MERCHANT_PLAN' }),
      );
    });
  });

  describe('getBillingPanel', () => {
    it('toma los totales de la base y no de la página devuelta', async () => {
      const harness = buildHarness([
        {
          invoice_count: '1200',
          invoiced_total: '9876543.21',
          open_receivable_count: '15',
          open_total: '1234.50',
        },
      ]);

      const panel = await harness.service.getBillingPanel(merchantScope, ACCOUNT_ID);

      expect(panel.summary).toMatchObject({
        invoiceCount: 1200,
        invoicedTotal: '9876543.21',
        openReceivableCount: 15,
        openTotal: '1234.50',
      });
      // Los documentos listados están acotados; los totales no dependen de ese tope.
      expect(panel.documentLimit).toBe(50);
      expect(harness.invoiceModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 }),
      );
    });

    it('resuelve la cuenta a través del servicio de alcance', async () => {
      const harness = buildHarness([]);
      await harness.service.getBillingPanel(merchantScope, ACCOUNT_ID);
      expect(harness.scopeService.resolveAccountId).toHaveBeenCalledWith(merchantScope, ACCOUNT_ID);
    });
  });

  describe('listAdvertisers', () => {
    it('devuelve vacío sin consultar cuando el comercio no tiene anunciantes', async () => {
      const harness = buildHarness();
      harness.scopeService.resolveAccessibleAdvertiserIds.mockResolvedValue([]);

      const result = await harness.service.listAdvertisers(merchantScope, {
        page: 1,
        limit: 50,
      });

      expect(result).toEqual([]);
      expect(harness.advertiserModel.findAll).not.toHaveBeenCalled();
    });

    it('no publica el NIT ni el límite de crédito del anunciante', async () => {
      const harness = buildHarness();
      harness.advertiserModel.findAll.mockResolvedValue([
        activeAdvertiser({ taxId: '1234567', creditLimitMicros: '900000000' }),
      ]);

      const [advertiser] = await harness.service.listAdvertisers(merchantScope, {
        page: 1,
        limit: 50,
      });

      expect(advertiser).not.toHaveProperty('taxId');
      expect(advertiser).not.toHaveProperty('creditLimitMicros');
      expect(advertiser?.tradeName).toBe('Comercio');
    });
  });

  describe('listCampaigns', () => {
    it('exige propiedad del anunciante antes de consultar', async () => {
      const harness = buildHarness();
      harness.scopeService.assertAdvertiserAccess.mockRejectedValue(new Error('forbidden'));

      await expect(
        harness.service.listCampaigns(merchantScope, {
          advertiserId: ADVERTISER_ID,
          page: 1,
          limit: 50,
        }),
      ).rejects.toThrow('forbidden');

      expect(harness.campaignModel.findAll).not.toHaveBeenCalled();
    });

    it('marca qué campañas puede alternar el comercio', async () => {
      const harness = buildHarness();
      harness.campaignModel.findAll.mockResolvedValue([
        campaignDouble({ id: 'c1', status: 'ACTIVE' }),
        campaignDouble({ id: 'c2', status: 'ENDED' }),
      ]);

      const campaigns = await harness.service.listCampaigns(merchantScope, {
        advertiserId: ADVERTISER_ID,
        page: 1,
        limit: 50,
      });

      expect(campaigns.map((campaign) => campaign.toggleable)).toEqual([true, false]);
    });
  });

  describe('createPlan', () => {
    it('devuelve un conflicto de dominio cuando el código ya existe', async () => {
      const harness = buildHarness();
      harness.planModel.findOne.mockResolvedValue({ id: PLAN_ID } as never);

      await expect(
        harness.service.createPlan(
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

      const plan = await harness.service.createPlan(
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

      await harness.service.createPlan(
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

      const updated = await harness.service.updatePlan(PLAN_ID, { cpmPrice: 3.2 }, actor);

      expect(plan.cpmMicros).toBe('3200000');
      expect(plan.cpcMicros).toBe('2500000');
      expect(updated.cpmPrice).toBe('3.20');
    });

    it('deja el precio anterior en la bitácora: sin él, una factura pasada no se puede explicar', async () => {
      const harness = buildHarness();
      harness.planModel.findByPk.mockResolvedValue(planDouble() as never);

      await harness.service.updatePlan(PLAN_ID, { cpmPrice: 3.2, cpcPrice: 1.9 }, actor);

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
        harness.service.updatePlan(PLAN_ID, { cpmPrice: 3.2 }, actor),
      ).rejects.toMatchObject({ response: { code: 'MERCHANT_PLAN_NOT_FOUND' } });
    });
  });
});

/*
 * Quién tiene que ELEGIR comercio lo contesta el servidor.
 *
 * Es la pieza que faltaba y por la que cuatro pantallas del portal se quedaban sin salida: el
 * navegador deducía por su cuenta si era comercio, y cuando se equivocaba no pintaba el selector
 * mientras el backend exigía la cuenta que ese selector habría dado.
 */
describe('getScope', () => {
  const cuentas = [
    { id: 'a1000000-0000-4000-8000-000000000001', tradeName: 'Alfa Store', legalName: 'Alfa SRL' },
    { id: 'a1000000-0000-4000-8000-000000000002', tradeName: '', legalName: 'Beta SA' },
  ];

  it('el staff interno SIEMPRE elige, y ve el catálogo', async () => {
    const harness = buildHarness();
    harness.accountModel.findAll.mockResolvedValue(cuentas);

    const result = await harness.service.getScope({
      isInternalOperator: true,
      accountIds: [],
      userId: 'u1',
      email: null,
      roles: ['ADMIN'],
    } as never);

    expect(result.isInternalOperator).toBe(true);
    expect(result.requiresAccountSelection).toBe(true);
    // Sin filtro por cuenta: el staff las ve todas.
    expect(harness.accountModel.findAll.mock.calls[0]?.[0]?.where).toEqual({});
    // El nombre cae al razón social cuando no hay nombre comercial, en vez de salir vacío.
    expect(result.accounts).toEqual([
      { id: cuentas[0]!.id, name: 'Alfa Store' },
      { id: cuentas[1]!.id, name: 'Beta SA' },
    ]);
  });

  it('un comercio con UNA cuenta no elige: la deriva el backend', async () => {
    const harness = buildHarness();
    harness.accountModel.findAll.mockResolvedValue([cuentas[0]]);

    const result = await harness.service.getScope({
      isInternalOperator: false,
      accountIds: [cuentas[0]!.id],
      userId: 'u2',
      email: 'due@comercio.test',
      roles: ['MERCHANT_ADMIN'],
    } as never);

    expect(result.isInternalOperator).toBe(false);
    expect(result.requiresAccountSelection).toBe(false);
    expect(result.accounts).toHaveLength(1);
  });

  it('un comercio con VARIAS cuentas sí elige, y sólo entre las suyas', async () => {
    const harness = buildHarness();
    harness.accountModel.findAll.mockResolvedValue(cuentas);
    const mias = [cuentas[0]!.id, cuentas[1]!.id];

    const result = await harness.service.getScope({
      isInternalOperator: false,
      accountIds: mias,
      userId: 'u3',
      email: 'multi@comercio.test',
      roles: ['MERCHANT_ADMIN'],
    } as never);

    expect(result.requiresAccountSelection).toBe(true);
    /*
     * El filtro es lo que impide que este endpoint sea una lista de comercios ajenos: un comercio
     * ve las suyas y nada más, que es lo que lo hace seguro de llamar desde el portal.
     */
    expect(harness.accountModel.findAll.mock.calls[0]?.[0]?.where).toEqual({
      id: { [Op.in]: mias },
    });
  });
});
