import type { AuthUser } from '../../../common/types/auth-context.types';
import { ContractsController } from './contracts.controller';

/**
 * La excepción de tarifa cuelga de QUIEN la pide (`requestedByUserId`), así que el usuario tiene que
 * atravesar el controlador hasta `B2BContractsService`. `tsc` lo comprueba por tipos, pero una mutación
 * `user → undefined as never` sobrevivía con toda la suite en verde: ninguna prueba miraba el paso.
 */

const USUARIO = { sub: 'usuario-1' } as AuthUser;

const build = () => {
  const contracts = {
    createMdrRule: jest.fn(async () => ({ id: 'regla-1' })),
    updateMdrRule: jest.fn(async () => ({ id: 'regla-1' })),
  };
  const controller = new ContractsController(contracts as never, {} as never);
  return { controller, contracts };
};

describe('ContractsController · el usuario llega a las reglas de comisión (T-7)', () => {
  it('createMdrRule pasa el usuario al servicio de contratos', async () => {
    const { controller, contracts } = build();
    const input = { contractVersionId: 'version-1', ratePercent: 3 } as never;

    await controller.createMdrRule(input, USUARIO);

    expect(contracts.createMdrRule).toHaveBeenCalledWith(input, USUARIO);
  });

  it('updateMdrRule pasa el usuario al servicio de contratos', async () => {
    const { controller, contracts } = build();
    const input = { ratePercent: 3 } as never;

    await controller.updateMdrRule({ ruleId: 'regla-1' } as never, input, USUARIO);

    expect(contracts.updateMdrRule).toHaveBeenCalledWith('regla-1', input, USUARIO);
  });
});
