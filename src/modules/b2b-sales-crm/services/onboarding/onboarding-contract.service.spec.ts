import { OnboardingContractService } from './onboarding-contract.service';
import { build } from './onboarding.fixtures';

describe('OnboardingContractService · el contrato legal por defecto', () => {
  it('lo lee de AtlasBackend y publica sólo la cabecera, nunca el cuerpo', async () => {
    const forward = jest.fn(async () => ({
      template: {
        templateId: '5',
        templateCode: 'CONTRATO-COMERCIO',
        name: 'Contrato marco',
        version: 2,
        body: 'texto largo',
        status: 'active',
        isDefault: true,
      },
    }));
    const { contracts } = build({ forward });
    const result = await contracts.getDefaultLegalContractTemplate('tok');
    expect(forward).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: 'operations/partner-contract-templates/default',
      }),
    );
    expect(result).toEqual({
      template: {
        templateId: '5',
        templateCode: 'CONTRATO-COMERCIO',
        name: 'Contrato marco',
        version: 2,
        status: 'active',
      },
    });
  });

  it('`null` no es un error: el inquilino aún no publicó ninguno', async () => {
    const { contracts } = build({ forward: jest.fn(async () => ({ template: null })) });
    expect(await contracts.getDefaultLegalContractTemplate('tok')).toEqual({ template: null });
  });
});

describe('OnboardingContractService · la comisión del alta (T-7)', () => {
  it('createCaseMdrRule resuelve la versión contractual DEL CASO y pasa el usuario', async () => {
    const contractsService = { createMdrRule: jest.fn(async () => ({ id: 'regla-1' })) };
    const { repository, ...built } = build();
    repository.onboardingCases.findByPk = jest.fn(async () => ({
      contractVersionId: 'version-del-caso',
    })) as never;
    const contracts = new OnboardingContractService(
      repository as never,
      { infoContext: jest.fn() } as never,
      built.partnerClient as never,
      built.caseQuery,
      contractsService as never,
    );
    const usuario = { sub: 'usuario-1' } as never;
    const input = { ratePercent: 3, pricingExceptionReason: 'Comercio ancla' } as never;

    await contracts.createCaseMdrRule('caso-9', input, usuario);

    expect(repository.onboardingCases.findByPk).toHaveBeenCalledWith('caso-9');
    expect(contractsService.createMdrRule).toHaveBeenCalledWith(
      {
        ratePercent: 3,
        pricingExceptionReason: 'Comercio ancla',
        contractVersionId: 'version-del-caso',
      },
      usuario,
    );
  });

  it('sin contrato pactado en el caso es un 409, no una comisión huérfana', async () => {
    const { repository, ...built } = build();
    repository.onboardingCases.findByPk = jest.fn(async () => ({
      contractVersionId: null,
    })) as never;
    const contractsService = { createMdrRule: jest.fn() };
    const contracts = new OnboardingContractService(
      repository as never,
      { infoContext: jest.fn() } as never,
      built.partnerClient as never,
      built.caseQuery,
      contractsService as never,
    );

    await expect(contracts.createCaseMdrRule('caso-9', {} as never, {} as never)).rejects.toThrow(
      /no tiene contrato pactado/,
    );
    expect(contractsService.createMdrRule).not.toHaveBeenCalled();
  });
});
