import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Op } from 'sequelize';
import { PortalScopeService, type PortalScope } from './portal.scope.service';
import type { AuthUser } from '../../common/types/auth-context.types';

const MERCHANT_USER_ID = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_A = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_B = '33333333-3333-4333-8333-333333333333';
const ADVERTISER_A = '44444444-4444-4444-8444-444444444444';
const ADVERTISER_FOREIGN = '55555555-5555-4555-8555-555555555555';

interface Stub {
  merchantUserModel: { findAll: jest.Mock };
  advertiserModel: { findAll: jest.Mock; findByPk: jest.Mock };
  advertiserUserModel: { findAll: jest.Mock };
  logger: { infoContext: jest.Mock; warnContext: jest.Mock; debugContext: jest.Mock };
}

function buildService(): { service: PortalScopeService; stub: Stub } {
  const stub: Stub = {
    merchantUserModel: { findAll: jest.fn().mockResolvedValue([]) },
    advertiserModel: { findAll: jest.fn().mockResolvedValue([]), findByPk: jest.fn() },
    advertiserUserModel: { findAll: jest.fn().mockResolvedValue([]) },
    logger: { infoContext: jest.fn(), warnContext: jest.fn(), debugContext: jest.fn() },
  };

  const service = new PortalScopeService(
    stub.merchantUserModel as never,
    stub.advertiserModel as never,
    stub.advertiserUserModel as never,
    stub.logger as never,
  );

  return { service, stub };
}

const merchantUser: AuthUser = {
  sub: MERCHANT_USER_ID,
  roles: ['MERCHANT_ADMIN'],
  email: 'Partner@Comercio.BO',
};

const internalUser: AuthUser = {
  sub: '99999999-9999-4999-8999-999999999999',
  roles: ['COMMERCIAL_MANAGER'],
  email: 'staff@atlas.bo',
};

function merchantScope(accountIds: string[]): PortalScope {
  return {
    isInternalOperator: false,
    accountIds,
    userId: MERCHANT_USER_ID,
    email: 'partner@comercio.bo',
    roles: ['MERCHANT_ADMIN'],
  };
}

const internalScope: PortalScope = {
  isInternalOperator: true,
  accountIds: [],
  userId: internalUser.sub,
  email: 'staff@atlas.bo',
  roles: ['COMMERCIAL_MANAGER'],
};

describe('PortalScopeService', () => {
  describe('resolveScope', () => {
    it('resuelve las cuentas del usuario partner y normaliza su correo', async () => {
      const { service, stub } = buildService();
      stub.merchantUserModel.findAll.mockResolvedValue([
        { accountId: ACCOUNT_A },
        { accountId: ACCOUNT_B },
        { accountId: ACCOUNT_A },
      ]);

      const scope = await service.resolveScope(merchantUser);

      expect(scope.isInternalOperator).toBe(false);
      expect(scope.accountIds).toEqual([ACCOUNT_A, ACCOUNT_B]);
      expect(scope.email).toBe('partner@comercio.bo');

      const where = stub.merchantUserModel.findAll.mock.calls[0][0].where;
      const clauses = where[Op.or] as Record<string, unknown>[];
      expect(clauses).toContainEqual({ userId: MERCHANT_USER_ID });
      expect(clauses).toContainEqual({ emailNormalized: 'partner@comercio.bo' });
    });

    it('rechaza al usuario partner sin membresía activa aunque su JWT traiga el rol', async () => {
      const { service, stub } = buildService();
      stub.merchantUserModel.findAll.mockResolvedValue([]);

      await expect(service.resolveScope(merchantUser)).rejects.toMatchObject({
        response: { code: 'PORTAL_SCOPE_NOT_PROVISIONED' },
      });
      expect(stub.logger.warnContext).toHaveBeenCalled();
    });

    it('no consulta membresías para el staff interno', async () => {
      const { service, stub } = buildService();

      const scope = await service.resolveScope(internalUser);

      expect(scope.isInternalOperator).toBe(true);
      expect(stub.merchantUserModel.findAll).not.toHaveBeenCalled();
    });

    it('no compara `sub` contra la columna uuid cuando no es un UUID', async () => {
      const { service, stub } = buildService();
      stub.merchantUserModel.findAll.mockResolvedValue([{ accountId: ACCOUNT_A }]);

      await service.resolveScope({ ...merchantUser, sub: 'auth0|not-a-uuid' });

      const where = stub.merchantUserModel.findAll.mock.calls[0][0].where;
      const clauses = where[Op.or] as Record<string, unknown>[];
      expect(clauses).toEqual([{ emailNormalized: 'partner@comercio.bo' }]);
    });
  });

  describe('resolveAccountId', () => {
    it('infiere la única cuenta del comercio cuando no se indica', () => {
      const { service } = buildService();
      expect(service.resolveAccountId(merchantScope([ACCOUNT_A]))).toBe(ACCOUNT_A);
    });

    it('exige elegir cuando el usuario opera varios comercios', () => {
      const { service } = buildService();
      expect(() => service.resolveAccountId(merchantScope([ACCOUNT_A, ACCOUNT_B]))).toThrow(
        BadRequestException,
      );
    });

    it('rechaza una cuenta ajena enviada por el cliente', () => {
      const { service, stub } = buildService();
      expect(() => service.resolveAccountId(merchantScope([ACCOUNT_A]), ACCOUNT_B)).toThrow(
        ForbiddenException,
      );
      expect(stub.logger.warnContext).toHaveBeenCalled();
    });

    it('acepta una cuenta propia enviada por el cliente', () => {
      const { service } = buildService();
      expect(service.resolveAccountId(merchantScope([ACCOUNT_A, ACCOUNT_B]), ACCOUNT_B)).toBe(
        ACCOUNT_B,
      );
    });

    it('obliga al staff interno a indicar la cuenta y registra el acceso delegado', () => {
      const { service, stub } = buildService();
      expect(() => service.resolveAccountId(internalScope)).toThrow(BadRequestException);

      expect(service.resolveAccountId(internalScope, ACCOUNT_A)).toBe(ACCOUNT_A);
      expect(stub.logger.infoContext).toHaveBeenCalledWith(
        'PortalScopeService',
        'Acceso delegado de staff interno',
        expect.objectContaining({ merchantAccountId: ACCOUNT_A }),
      );
    });
  });

  describe('resolveAccessibleAdvertiserIds', () => {
    it('devuelve los anunciantes de las cuentas del comercio y sus vínculos directos', async () => {
      const { service, stub } = buildService();
      stub.advertiserModel.findAll.mockResolvedValue([{ id: ADVERTISER_A }]);
      stub.advertiserUserModel.findAll.mockResolvedValue([
        { advertiserId: ADVERTISER_A },
        { advertiserId: ADVERTISER_FOREIGN },
      ]);

      const ids = await service.resolveAccessibleAdvertiserIds(merchantScope([ACCOUNT_A]));

      expect(ids).toEqual([ADVERTISER_A, ADVERTISER_FOREIGN]);
    });

    it('devuelve null (sin filtro) solo para staff interno sin cuenta indicada', async () => {
      const { service } = buildService();
      expect(await service.resolveAccessibleAdvertiserIds(internalScope)).toBeNull();
    });

    it('filtra por la cuenta indicada validándola contra el alcance del comercio', async () => {
      const { service } = buildService();
      await expect(
        service.resolveAccessibleAdvertiserIds(merchantScope([ACCOUNT_A]), ACCOUNT_B),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('assertAdvertiserAccess', () => {
    it('permite el anunciante enlazado a una cuenta del comercio', async () => {
      const { service, stub } = buildService();
      stub.advertiserModel.findByPk.mockResolvedValue({
        id: ADVERTISER_A,
        merchantAccountId: ACCOUNT_A,
      });

      await expect(
        service.assertAdvertiserAccess(merchantScope([ACCOUNT_A]), ADVERTISER_A),
      ).resolves.toBeUndefined();
    });

    it('rechaza el anunciante de otro comercio', async () => {
      const { service, stub } = buildService();
      stub.advertiserModel.findByPk.mockResolvedValue({
        id: ADVERTISER_FOREIGN,
        merchantAccountId: ACCOUNT_B,
      });

      await expect(
        service.assertAdvertiserAccess(merchantScope([ACCOUNT_A]), ADVERTISER_FOREIGN),
      ).rejects.toMatchObject({ response: { code: 'ADVERTISER_FORBIDDEN' } });
    });

    it('rechaza igual si el anunciante no existe, sin revelar su ausencia', async () => {
      const { service, stub } = buildService();
      stub.advertiserModel.findByPk.mockResolvedValue(null);

      await expect(
        service.assertAdvertiserAccess(merchantScope([ACCOUNT_A]), ADVERTISER_FOREIGN),
      ).rejects.toMatchObject({ response: { code: 'ADVERTISER_FORBIDDEN' } });
    });

    it('acepta el anunciante sin enlace de cuenta pero con vínculo directo del usuario', async () => {
      const { service, stub } = buildService();
      stub.advertiserModel.findByPk.mockResolvedValue({
        id: ADVERTISER_A,
        merchantAccountId: null,
      });
      stub.advertiserUserModel.findAll.mockResolvedValue([{ advertiserId: ADVERTISER_A }]);

      await expect(
        service.assertAdvertiserAccess(merchantScope([ACCOUNT_A]), ADVERTISER_A),
      ).resolves.toBeUndefined();
    });

    it('no consulta nada para el staff interno', async () => {
      const { service, stub } = buildService();
      await service.assertAdvertiserAccess(internalScope, ADVERTISER_FOREIGN);
      expect(stub.advertiserModel.findByPk).not.toHaveBeenCalled();
    });
  });
});
