import type { AuthUser } from '../../../common/types/auth-context.types';
import { B2BSalesCrmService } from './b2b-sales-crm.service';

/**
 * La excepción de tarifa cuelga de QUIEN la pide (`requestedByUserId`), así que el usuario tiene que
 * atravesar la fachada hasta `B2BContractsService`. `tsc` lo comprueba por tipos, pero una mutación
 * `user → undefined as never` sobrevivía con toda la suite en verde: ninguna prueba miraba el paso.
 */

const USUARIO = { sub: 'usuario-1' } as AuthUser;

const build = () => {
  const contractsService = {
    createMdrRule: jest.fn(async () => ({ id: 'regla-1' })),
    updateMdrRule: jest.fn(async () => ({ id: 'regla-1' })),
  };
  const onboardingService = {
    requireCaseContractVersionId: jest.fn(async () => 'version-del-caso'),
  };
  const sinUso = {} as never;
  const service = new B2BSalesCrmService(
    sinUso,
    sinUso,
    contractsService as never,
    onboardingService as never,
    sinUso,
    sinUso,
    sinUso,
    sinUso,
    sinUso,
  );
  return { service, contractsService, onboardingService };
};

describe('B2BSalesCrmService · el usuario llega a las reglas de comisión (T-7)', () => {
  it('createMdrRule pasa el usuario al servicio de contratos', async () => {
    const { service, contractsService } = build();
    const input = { contractVersionId: 'version-1', ratePercent: 3 } as never;

    await service.createMdrRule(input, USUARIO);

    expect(contractsService.createMdrRule).toHaveBeenCalledWith(input, USUARIO);
  });

  it('updateMdrRule pasa el usuario al servicio de contratos', async () => {
    const { service, contractsService } = build();
    const input = { ratePercent: 3 } as never;

    await service.updateMdrRule('regla-1', input, USUARIO);

    expect(contractsService.updateMdrRule).toHaveBeenCalledWith('regla-1', input, USUARIO);
  });

  it('createCaseMdrRule resuelve la versión contractual DEL CASO y pasa el usuario', async () => {
    const { service, contractsService, onboardingService } = build();
    const input = { ratePercent: 3, pricingExceptionReason: 'Comercio ancla' } as never;

    await service.createCaseMdrRule('caso-9', input, USUARIO);

    expect(onboardingService.requireCaseContractVersionId).toHaveBeenCalledWith('caso-9');
    expect(contractsService.createMdrRule).toHaveBeenCalledWith(
      {
        ratePercent: 3,
        pricingExceptionReason: 'Comercio ancla',
        contractVersionId: 'version-del-caso',
      },
      USUARIO,
    );
  });
});
