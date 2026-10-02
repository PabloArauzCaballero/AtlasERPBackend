import { B2BAccountsController } from './b2b-accounts.controller';

/**
 * Completar el expediente en la cuenta lo entrega en el acto a Atlas si el comercio ya tiene
 * expediente (2026-10-02, Multicenter: el dato quedaba en el ERP y el comercio seguía viendo
 * «Falta N requisitos»). Sin expediente todavía, no se llama a Atlas: se entrega al abrir el onboarding.
 */
describe('B2BAccountsController · PATCH :accountId/dossier', () => {
  const user = { sub: 'u-1' } as never;
  const body = { commercialRegistry: '00008022' } as never;

  function build(partnerProfileId: string | null) {
    const service = {
      setAccountDossier: jest.fn(async () => ({
        id: 'acc-1',
        partnerProfileId,
        dossierMissing: [],
      })),
    };
    const merchantFolder = {
      tryEnsureForAccount: jest.fn(async () => ({
        partnerId: '2',
        expedienteId: 'e-1',
        created: false,
        reason: null,
        loaded: ['commercial_registry'],
        gaps: ['legal_representative'],
      })),
    };
    const controller = new B2BAccountsController(service as never, merchantFolder as never);
    return { controller, service, merchantFolder };
  }

  it('con expediente en Atlas, entrega lo completado con el token de la sesión y lo cuenta en la respuesta', async () => {
    const { controller, merchantFolder } = build('2');
    const req = { cookies: { atlas_upstream_at: 'tok' } } as never;

    const respuesta = await controller.setAccountDossier(req, { accountId: 'acc-1' }, body, user);

    expect(merchantFolder.tryEnsureForAccount).toHaveBeenCalledWith('acc-1', 'tok');
    expect(respuesta).toMatchObject({ carpetaDelComercio: { loaded: ['commercial_registry'] } });
  });

  it('sin expediente todavía no llama a Atlas', async () => {
    const { controller, merchantFolder } = build(null);

    const respuesta = await controller.setAccountDossier(
      { cookies: {} } as never,
      { accountId: 'acc-1' },
      body,
      user,
    );

    expect(merchantFolder.tryEnsureForAccount).not.toHaveBeenCalled();
    expect(respuesta).not.toHaveProperty('carpetaDelComercio');
  });
});
