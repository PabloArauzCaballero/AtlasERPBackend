import { ConflictException, ForbiddenException } from '@nestjs/common';
import { MerchantUserAccessService } from './merchant-user-access.service';
import { fila } from './onboarding.fixtures';

describe('MerchantUserAccessService · pedir credenciales', () => {
  function buildAlta(enqueue: jest.Mock) {
    const user = fila({
      id: 'u-1',
      accountId: 'acc-1',
      branchId: null,
      email: 'x@y.z',
      fullName: 'X',
      roleCode: 'MERCHANT_OPERATOR',
      status: 'INVITED',
    });
    const repository = {
      accounts: { findByPk: jest.fn(async () => ({ id: 'acc-1', legalName: 'Comercio SRL' })) },
      branches: { findOne: jest.fn() },
      merchantUsers: { findOne: jest.fn(async () => null), create: jest.fn(async () => user) },
      onboardingCases: { update: jest.fn() },
      transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(undefined)),
    };
    const userAccess = new MerchantUserAccessService(
      repository as never,
      { infoContext: jest.fn() } as never,
      { enqueueMerchantUserProvisioning: enqueue } as never,
    );
    return { userAccess, repository, user };
  }

  it('el 403 de AtlasBackend dice qué permiso falta y la fila del CRM no queda a medias', async () => {
    const { userAccess, repository } = buildAlta(
      jest.fn(async () => {
        throw new ForbiddenException('El usuario interno no tiene los permisos requeridos.');
      }),
    );

    await expect(
      userAccess.createMerchantUser(
        {
          accountId: 'acc-1',
          email: 'x@y.z',
          fullName: 'X',
          roleCode: 'MERCHANT_OPERATOR',
        } as never,
        'tok',
      ),
    ).rejects.toThrow(/merchant\.users\.request/);
    // La transacción se deshace con el error: no queda un INVITED sin petición detrás.
    expect(repository.onboardingCases.update).not.toHaveBeenCalled();
  });

  it('cualquier otro rechazo de Atlas llega tal cual: es el que explica qué corregir', async () => {
    const { userAccess } = buildAlta(
      jest.fn(async () => {
        throw new ConflictException('Ya hay una petición pendiente para ese correo.');
      }),
    );
    await expect(
      userAccess.createMerchantUser(
        {
          accountId: 'acc-1',
          email: 'x@y.z',
          fullName: 'X',
          roleCode: 'MERCHANT_OPERATOR',
        } as never,
        'tok',
      ),
    ).rejects.toThrow('Ya hay una petición pendiente para ese correo.');
  });
});
