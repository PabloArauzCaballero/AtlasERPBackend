import type { PortalActor } from './portal-actor';
import type { PortalScope } from './portal.scope.service';
import { PortalBranchCommandService } from './commands/portal-branch-commands.service';
import { PortalCampaignCommandService } from './commands/portal-campaign-commands.service';
import { PortalPlanCommandService } from './commands/portal-plan-commands.service';
import { PortalSubscriptionCommandService } from './commands/portal-subscription-commands.service';
import { PortalBillingQueryService } from './queries/portal-billing-query.service';
import { PortalCatalogQueryService } from './queries/portal-catalog-query.service';
import { PortalMerchantQueryService } from './queries/portal-merchant-query.service';
import type { AuthUser } from '../../common/types/auth-context.types';

export const USER_ID = '11111111-1111-4111-8111-111111111111';
export const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
export const PLAN_ID = '33333333-3333-4333-8333-333333333333';
export const OTHER_PLAN_ID = '66666666-6666-4666-8666-666666666666';
export const CAMPAIGN_ID = '44444444-4444-4444-8444-444444444444';
export const ADVERTISER_ID = '55555555-5555-4555-8555-555555555555';

export const user: AuthUser = { sub: USER_ID, roles: ['MERCHANT_ADMIN'], role: 'MERCHANT_ADMIN' };

export const merchantScope: PortalScope = {
  isInternalOperator: false,
  accountIds: [ACCOUNT_ID],
  userId: USER_ID,
  email: 'partner@comercio.bo',
  roles: ['MERCHANT_ADMIN'],
};

export const actor: PortalActor = {
  user,
  requestId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  scope: merchantScope,
};

/** Transacción simulada: ejecuta la retrollamada y expone el modo de bloqueo usado. */
export function fakeSequelize(queryRows: unknown[] = []) {
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  return {
    transaction: jest.fn(async (callback: (t: unknown) => Promise<unknown>) =>
      callback(transaction),
    ),
    query: jest.fn().mockResolvedValue(queryRows),
    __transaction: transaction,
  };
}

export interface Harness {
  catalog: PortalCatalogQueryService;
  billing: PortalBillingQueryService;
  merchant: PortalMerchantQueryService;
  plans: PortalPlanCommandService;
  subscriptions: PortalSubscriptionCommandService;
  branches: PortalBranchCommandService;
  campaigns: PortalCampaignCommandService;
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
  branchModel: { findAll: jest.Mock; findByPk: jest.Mock; create: jest.Mock };
  accountModel: { findByPk: jest.Mock; findAll: jest.Mock };
  invoiceModel: { findAll: jest.Mock };
  receivableModel: { findAll: jest.Mock };
  advertiserModel: { findAll: jest.Mock; findByPk: jest.Mock };
  campaignModel: { findAll: jest.Mock; findByPk: jest.Mock };
}

export function buildHarness(queryRows: unknown[] = []): Harness {
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
  const branchModel = {
    findAll: jest.fn().mockResolvedValue([]),
    findByPk: jest.fn(),
    create: jest.fn(async (valores: Record<string, unknown>) => ({ id: 'branch-new', ...valores })),
  };
  /* El usuario de comercio detras del `sub` del token: es lo que se guarda como actor. */
  const merchantUserModel = {
    findOne: jest.fn().mockResolvedValue({ id: 'b1000000-0000-4000-8000-000000000001' }),
  };
  const accountModel = { findByPk: jest.fn(), findAll: jest.fn().mockResolvedValue([]) };
  const invoiceModel = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
  };
  const invoiceLineModel = { findAll: jest.fn().mockResolvedValue([]) };
  const receivableModel = { findAll: jest.fn().mockResolvedValue([]) };
  const advertiserModel = { findAll: jest.fn().mockResolvedValue([]), findByPk: jest.fn() };
  const campaignModel = { findAll: jest.fn().mockResolvedValue([]), findByPk: jest.fn() };

  const logger_ = logger as never;
  const scope_ = scopeService as never;
  const logs_ = businessActionLogs as never;
  const seq_ = sequelize as never;
  const catalog = new PortalCatalogQueryService(planModel as never, billingProductModel as never);
  const billing = new PortalBillingQueryService(
    seq_,
    scope_,
    subscriptionModel as never,
    accountModel as never,
    invoiceModel as never,
    invoiceLineModel as never,
    receivableModel as never,
  );
  const merchant = new PortalMerchantQueryService(
    scope_,
    branchModel as never,
    accountModel as never,
    advertiserModel as never,
    campaignModel as never,
  );
  const plans = new PortalPlanCommandService(seq_, logger_, logs_, planModel as never);
  const subscriptions = new PortalSubscriptionCommandService(
    seq_,
    logger_,
    scope_,
    logs_,
    planModel as never,
    subscriptionModel as never,
    merchantUserModel as never,
    accountModel as never,
  );
  const branches = new PortalBranchCommandService(
    seq_,
    logger_,
    scope_,
    logs_,
    branchModel as never,
    accountModel as never,
  );
  const campaigns = new PortalCampaignCommandService(
    seq_,
    logger_,
    scope_,
    auditService as never,
    logs_,
    advertiserModel as never,
    campaignModel as never,
  );

  return {
    catalog,
    billing,
    merchant,
    plans,
    subscriptions,
    branches,
    campaigns,
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
export function campaignDouble(overrides: Record<string, unknown> = {}) {
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

export function activeAdvertiser(overrides: Record<string, unknown> = {}) {
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
