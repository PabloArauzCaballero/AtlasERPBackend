import { BusinessPartnersService } from './business-partners.service';

/**
 * BUG-6 (QA 2026-10-29): asignar la cuenta por defecto de un socio respondía 409 porque el upsert
 * iba sin `conflictFields` y la tabla tiene PK `id` + único (business_partner_id, account_purpose).
 */
describe('BusinessPartnersService.setDefaultAccount', () => {
  function build() {
    const row = { id: 'fila-1' };
    const defaultAccountModel = { upsert: jest.fn(async () => [row, false]) };
    const businessPartnerModel = { findByPk: jest.fn(async () => ({ id: 'bp-1' })) };
    const logger = { info: jest.fn(), debug: jest.fn() };
    const service = new BusinessPartnersService(
      {} as never,
      {} as never,
      logger as never,
      businessPartnerModel as never,
      {} as never,
      defaultAccountModel as never,
    );
    return { service, defaultAccountModel, businessPartnerModel };
  }

  it('actualiza la fila existente: el upsert resuelve el conflicto por (socio, propósito)', async () => {
    const { service, defaultAccountModel } = build();
    const result = await service.setDefaultAccount('bp-1', {
      accountPurpose: 'AR_CONTROL',
      glAccountId: 'gl-1',
    } as never);

    expect(result).toEqual({ id: 'fila-1' });
    expect(defaultAccountModel.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        businessPartnerId: 'bp-1',
        accountPurpose: 'AR_CONTROL',
        glAccountId: 'gl-1',
      }),
      { conflictFields: ['business_partner_id', 'account_purpose'] },
    );
  });

  it('un socio inexistente falla antes de tocar las cuentas', async () => {
    const { service, defaultAccountModel, businessPartnerModel } = build();
    businessPartnerModel.findByPk.mockResolvedValueOnce(null as never);
    await expect(
      service.setDefaultAccount('no-existe', { accountPurpose: 'AR_CONTROL', glAccountId: 'gl-1' } as never),
    ).rejects.toThrow();
    expect(defaultAccountModel.upsert).not.toHaveBeenCalled();
  });
});
