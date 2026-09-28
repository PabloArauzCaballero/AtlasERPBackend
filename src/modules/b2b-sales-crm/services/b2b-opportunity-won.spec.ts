import { ConflictException } from '@nestjs/common';
import { ContractStatus, OpportunityStage } from '../b2b-sales-crm.enums';
import { B2BContractsService } from './b2b-contracts.service';
import { B2BPipelineService } from './b2b-pipeline.service';

jest.mock('./mdr-updated-publisher.support', () => ({
  publishMdrUpdatedForContractVersion: jest.fn(async () => undefined),
}));
jest.mock('../../../common/numbering/document-numbering', () => ({
  nextDocumentNumber: jest.fn(async () => 'CTR-1'),
}));

/**
 * «Ganada» es «contrato firmado» (así lo explica el tablero). Antes se llegaba a ella sin pasar por
 * contratación: arrastrando la tarjeta desde cualquier etapa, o al CREAR el contrato, que nace
 * pendiente de firma. Cada prueba falla sin su arreglo.
 */
const logger = { infoContext: jest.fn() };
const TX = { id: 'tx' };

function repositorio(sobre: Record<string, unknown> = {}) {
  return {
    transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(TX)),
    opportunities: { findByPk: jest.fn(), update: jest.fn() },
    contracts: { findOne: jest.fn(async () => null), findByPk: jest.fn(), create: jest.fn() },
    contractVersions: { findOne: jest.fn(), create: jest.fn() },
    commercialTerms: { create: jest.fn() },
    proposals: { findOne: jest.fn(async () => null) },
    findProposalWithLines: jest.fn(),
    ...sobre,
  };
}

describe('mover una oportunidad a Ganada a mano', () => {
  const oportunidad = () => ({ id: 'op-1', stage: OpportunityStage.DISCOVERY, update: jest.fn() });

  it('sin contrato firmado se rechaza con 409 y la etapa no cambia', async () => {
    const op = oportunidad();
    const repo = repositorio({
      opportunities: { findByPk: jest.fn(async () => op), update: jest.fn() },
    });
    const service = new B2BPipelineService(repo as never, logger as never);

    await expect(
      service.moveOpportunityStage('op-1', { stage: OpportunityStage.CLOSED_WON } as never),
    ).rejects.toThrow(ConflictException);
    expect(repo.contracts.findOne).toHaveBeenCalledWith({
      where: { opportunityId: 'op-1', status: ContractStatus.ACTIVE },
    });
    expect(op.update).not.toHaveBeenCalled();
  });

  it('con el contrato ya firmado sí se permite', async () => {
    const op = oportunidad();
    const repo = repositorio({
      opportunities: { findByPk: jest.fn(async () => op), update: jest.fn() },
      contracts: { findOne: jest.fn(async () => ({ id: 'ctr-1', status: ContractStatus.ACTIVE })) },
    });
    const service = new B2BPipelineService(repo as never, logger as never);

    await service.moveOpportunityStage('op-1', { stage: OpportunityStage.CLOSED_WON } as never);

    expect(op.update).toHaveBeenCalledWith(
      expect.objectContaining({ stage: OpportunityStage.CLOSED_WON }),
    );
  });
});

describe('contrato y etapa', () => {
  it('crear el contrato deja la oportunidad en Contratación: no la marca Ganada', async () => {
    const repo = repositorio({
      findProposalWithLines: jest.fn(async () => ({
        id: 'pr-1',
        status: 'ACCEPTED',
        opportunityId: 'op-1',
        accountId: 'acc-1',
        lines: [],
      })),
      contracts: {
        findOne: jest.fn(async () => null),
        create: jest.fn(async (datos: Record<string, unknown>) => ({ id: 'ctr-1', ...datos })),
      },
      contractVersions: { create: jest.fn(async () => ({ id: 'v-1', versionNumber: 1 })) },
    });
    const service = new B2BContractsService(repo as never, logger as never);

    await service.createContractFromProposal({
      proposalId: 'pr-1',
      startDate: '2026-09-28',
    } as never);

    expect(repo.opportunities.update).not.toHaveBeenCalled();
  });

  it('firmar el contrato marca la oportunidad Ganada en la misma transacción', async () => {
    const contrato = {
      id: 'ctr-1',
      opportunityId: 'op-1',
      status: ContractStatus.PENDING_SIGNATURE,
      update: jest.fn(),
    };
    const repo = repositorio({
      contracts: { findByPk: jest.fn(async () => contrato) },
      contractVersions: { findOne: jest.fn(async () => ({ id: 'v-1', update: jest.fn() })) },
    });
    const service = new B2BContractsService(repo as never, logger as never);

    await service.signAndActivateContract('ctr-1', { approvedByUserId: 'u-1' } as never);

    expect(repo.opportunities.update).toHaveBeenCalledWith(
      expect.objectContaining({ stage: OpportunityStage.CLOSED_WON }),
      { where: { id: 'op-1' }, transaction: TX },
    );
  });

  it('un contrato ya activo no se vuelve a firmar (409)', async () => {
    const contrato = {
      id: 'ctr-1',
      opportunityId: 'op-1',
      status: ContractStatus.ACTIVE,
      update: jest.fn(),
    };
    const repo = repositorio({ contracts: { findByPk: jest.fn(async () => contrato) } });
    const service = new B2BContractsService(repo as never, logger as never);

    await expect(service.signAndActivateContract('ctr-1', {} as never)).rejects.toThrow(
      ConflictException,
    );
    expect(contrato.update).not.toHaveBeenCalled();
  });
});
