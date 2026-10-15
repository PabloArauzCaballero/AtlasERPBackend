import { build } from './onboarding.fixtures';

describe('OnboardingCaseQueryService · la cola de onboarding', () => {
  it('cada requisito de la cola dice si pide archivo y si ya lo tiene, como el detalle', async () => {
    const { caseQuery, repository } = build();
    const caso = {
      id: 'caso-1',
      accountId: 'acc-1',
      status: 'OPEN',
      startedAt: new Date('2026-09-01T00:00:00Z'),
      completedAt: null,
      account: { tradeName: 'CPA Centro', legalName: null },
      checklistItems: [
        {
          id: 'r1',
          itemType: 'NIT',
          description: 'NIT',
          status: 'PENDING',
          evidenceStorageKey: null,
        },
        {
          id: 'r2',
          itemType: 'legal',
          description: 'Poder',
          status: 'PENDING',
          evidenceStorageKey: 'k/2',
        },
        {
          id: 'r3',
          itemType: 'VISITA',
          description: 'Visita',
          status: 'PENDING',
          evidenceStorageKey: null,
        },
      ],
    };
    Object.assign(repository.onboardingCases, {
      findAndCountAll: jest.fn(async () => ({ rows: [caso], count: 1 })),
    });

    const result = (await caseQuery.listOnboardingCases({
      page: 1,
      limit: 50,
      scope: 'abiertos',
    })) as { items: Array<{ checklistItems: Array<Record<string, unknown>> }> };

    expect(result.items[0]!.checklistItems).toEqual([
      expect.objectContaining({ id: 'r1', requiresEvidence: true, hasEvidence: false }),
      expect.objectContaining({ id: 'r2', requiresEvidence: true, hasEvidence: true }),
      expect.objectContaining({ id: 'r3', requiresEvidence: false, hasEvidence: false }),
    ]);
  });
});
