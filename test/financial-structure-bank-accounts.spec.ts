import { FinancialStructureService } from '../src/modules/accounting/financial-structure/services/financial-structure.service';

/**
 * Cuentas bancarias (adenda 2026-09-29, 4b): la pantalla pintaba «Banco» vacío porque la API no
 * lo devolvía, y a cambio entregaba `accountNoHash`, una huella que no debe salir del servidor.
 */
type Row = Record<string, unknown> & { bankBpId: string | null };

function build(rows: Row[], banks: Array<Record<string, unknown>>) {
  const bankAccountModel = {
    findAll: jest.fn(async () =>
      rows.map((row) => ({ ...row, get: () => ({ ...row, accountNoHash: 'sha256:secreto' }) })),
    ),
  };
  const businessPartnerModel = { findAll: jest.fn(async () => banks) };
  const access = { accessibleLegalEntityIds: jest.fn(() => null) };
  const none = {} as never;
  const service = new FinancialStructureService(
    none,
    access as never,
    none,
    none,
    none,
    none,
    none,
    none,
    none,
    none,
    none,
    none,
    none,
    bankAccountModel as never,
    businessPartnerModel as never,
  );
  return { service, bankAccountModel, businessPartnerModel };
}

describe('FinancialStructureService.listBankAccounts', () => {
  const user = { sub: 'u', role: 'ADMIN' } as never;

  it('trae el nombre del banco por bankBpId y nunca devuelve la huella del número', async () => {
    const { service, bankAccountModel } = build(
      [
        { id: 'c1', accountName: 'BNB corriente', bankBpId: 'bp-bnb', currencyCode: 'BOB' },
        { id: 'c2', accountName: 'Caja chica', bankBpId: null, currencyCode: 'BOB' },
        { id: 'c3', accountName: 'Cuenta huérfana', bankBpId: 'bp-borrado', currencyCode: 'USD' },
      ],
      [{ id: 'bp-bnb', legalName: 'Banco Nacional de Bolivia S.A.', tradeName: 'BNB' }],
    );

    const result = await service.listBankAccounts(user);

    expect(result).toEqual([
      expect.objectContaining({ id: 'c1', bankName: 'BNB' }),
      expect.objectContaining({ id: 'c2', bankName: null }),
      expect.objectContaining({ id: 'c3', bankName: null }),
    ]);
    result.forEach((row) => {
      expect(row).not.toHaveProperty('accountNoHash');
      expect(row).not.toHaveProperty('accountNumberMasked');
    });
    expect(bankAccountModel.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ attributes: { exclude: ['accountNoHash'] } }),
    );
  });

  it('sin cuentas con banco no consulta socios de negocio', async () => {
    const { service, businessPartnerModel } = build(
      [{ id: 'c2', accountName: 'Caja', bankBpId: null }],
      [],
    );
    await service.listBankAccounts(user);
    expect(businessPartnerModel.findAll).not.toHaveBeenCalled();
  });
});
