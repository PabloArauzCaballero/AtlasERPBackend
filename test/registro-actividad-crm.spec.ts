/**
 * WP14-ERPB (adenda P1): el «Registro de actividad» prometía quién movió una oportunidad, quién
 * decidió una aprobación y quién firmó un contrato, y nada de eso se escribía. `moveOpportunityStage`
 * ni siquiera recibía al usuario.
 */
import {
  ApprovalStatus,
  ContractStatus,
  OpportunityStage,
} from '../src/modules/b2b-sales-crm/b2b-sales-crm.enums';
import { B2BContractsService } from '../src/modules/b2b-sales-crm/services/b2b-contracts.service';
import { B2BPipelineService } from '../src/modules/b2b-sales-crm/services/b2b-pipeline.service';

jest.mock('../src/modules/b2b-sales-crm/services/mdr-updated-publisher.support', () => ({
  publishMdrUpdatedForContractVersion: jest.fn(async () => undefined),
}));

const TX = { id: 'tx' };
const user = { sub: '22222222-2222-4222-8222-222222222222', role: 'COMMERCIAL_MANAGER' };
const logger = { infoContext: jest.fn() };

function base(sobre: Record<string, unknown>) {
  return {
    transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(TX)),
    proposals: { findOne: jest.fn(async () => null), update: jest.fn() },
    contracts: { findOne: jest.fn(async () => null) },
    mdrRules: { update: jest.fn() },
    opportunities: { update: jest.fn() },
    ...sobre,
  };
}

it('mover una oportunidad registra quién, desde qué etapa y hacia cuál', async () => {
  const op = { id: 'op-1', stage: OpportunityStage.DISCOVERY, update: jest.fn() };
  const record = jest.fn(async () => undefined);
  const repo = base({ opportunities: { findByPk: jest.fn(async () => op) } });
  const svc = new B2BPipelineService(repo as never, logger as never, { record } as never);

  await svc.moveOpportunityStage(
    'op-1',
    { stage: OpportunityStage.CLOSED_LOST, lossReason: 'Precio' } as never,
    user as never,
  );

  expect(record).toHaveBeenCalledWith(
    expect.objectContaining({
      actionCode: 'MOVE_OPPORTUNITY_STAGE',
      actorUserId: user.sub,
      aggregateId: 'op-1',
      inputSummary: {
        fromStage: OpportunityStage.DISCOVERY,
        toStage: OpportunityStage.CLOSED_LOST,
        lossReason: 'Precio',
      },
      transaction: TX,
    }),
  );
});

it('decidir una aprobación registra quién y qué decidió', async () => {
  const approval = {
    id: 'ap-1',
    proposalId: 'pr-1',
    mdrRuleId: null,
    status: ApprovalStatus.PENDING,
    update: jest.fn(),
  };
  const record = jest.fn(async () => undefined);
  const repo = base({ approvalRequests: { findByPk: jest.fn(async () => approval) } });
  const svc = new B2BPipelineService(repo as never, logger as never, { record } as never);

  await svc.decideApproval(
    'ap-1',
    { status: ApprovalStatus.REJECTED, reason: 'Margen' } as never,
    user as never,
  );

  expect(record).toHaveBeenCalledWith(
    expect.objectContaining({
      actionCode: 'DECIDE_APPROVAL_REQUEST',
      actorUserId: user.sub,
      aggregateId: 'ap-1',
      inputSummary: { decision: ApprovalStatus.REJECTED, reason: 'Margen' },
    }),
  );
});

it('firmar y activar un contrato registra quién lo hizo', async () => {
  const contrato = {
    id: 'ctr-1',
    opportunityId: null,
    status: ContractStatus.PENDING_SIGNATURE,
    update: jest.fn(),
  };
  const record = jest.fn(async () => undefined);
  const repo = base({
    contracts: { findByPk: jest.fn(async () => contrato) },
    contractVersions: { findOne: jest.fn(async () => ({ id: 'v-1', update: jest.fn() })) },
  });
  const svc = new B2BContractsService(repo as never, logger as never, { record } as never);

  await svc.signAndActivateContract('ctr-1', { approvedByUserId: 'u-9' } as never, user as never);

  expect(record).toHaveBeenCalledWith(
    expect.objectContaining({
      actionCode: 'SIGN_AND_ACTIVATE_CONTRACT',
      actorUserId: user.sub,
      aggregateId: 'ctr-1',
      transaction: TX,
    }),
  );
});
