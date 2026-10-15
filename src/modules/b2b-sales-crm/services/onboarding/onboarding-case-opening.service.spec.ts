import { EXPEDIENTE_COMPLETO, build } from './onboarding.fixtures';

describe('OnboardingCaseOpeningService · la carpeta del comercio al abrir el caso', () => {
  function conAlta(folder?: jest.Mock) {
    const ctx = build({
      folder,
      caso: {
        account: {
          id: 'acc-1',
          taxId: '1023456789',
          legalName: 'Comercio SRL',
          partnerProfileId: null,
          update: jest.fn(),
          ...EXPEDIENTE_COMPLETO,
        },
      },
    });
    Object.assign(ctx.repository.onboardingCases, {
      findOne: jest.fn(async () => null),
      create: jest.fn(async () => ({ id: 'caso-1' })),
    });
    Object.assign(ctx.repository.checklistItems, { create: jest.fn(async () => ({})) });
    Object.assign(ctx.repository, { opportunities: { count: jest.fn(async () => oportunidades) } });
    return ctx;
  }
  let oportunidades = 1;
  beforeEach(() => {
    oportunidades = 1;
  });
  const entrada = {
    accountId: 'acc-1',
    ownerUserId: 'u-1',
    checklistItems: [{ itemType: 'nit', description: 'NIT vigente' }],
  };

  // Predecesora (Pablo, 2026-09-28 y 2026-10-01): calificar → oportunidad → GANADA → onboarding.
  it('sin oportunidad GANADA no abre el caso (409) ni toca la carpeta', async () => {
    oportunidades = 0;
    const { opening, merchantFolder, repository } = conAlta();

    await expect(opening.createOnboardingCase(entrada, 'tok')).rejects.toThrow(
      /oportunidad ganada/,
    );
    expect(
      (repository.onboardingCases as unknown as { create: jest.Mock }).create,
    ).not.toHaveBeenCalled();
    expect(merchantFolder.tryEnsureForAccount).not.toHaveBeenCalled();
  });

  it('asegura la carpeta con el token de la sesión, guarda el puente y lo cuenta en la respuesta', async () => {
    const { opening, merchantFolder, repository } = conAlta();

    const respuesta = await opening.createOnboardingCase(entrada, 'tok');

    expect(merchantFolder.tryEnsureForAccount).toHaveBeenCalledWith('acc-1', 'tok');
    expect(repository.accounts.update).toHaveBeenCalledWith(
      { partnerProfileId: 'p-9' },
      { where: { id: 'acc-1', partnerProfileId: null } },
    );
    expect(respuesta.carpetaDelComercio).toMatchObject({ expedienteId: 'e-1' });
  });

  it('si Atlas no deja carpeta, el caso se abre igual y la respuesta dice por qué', async () => {
    const folder = jest.fn(async () => ({
      partnerId: null,
      expedienteId: null,
      created: false,
      reason: 'SIN_CORREO_DE_CONTACTO',
    }));
    const { opening, repository } = conAlta(folder);

    const respuesta = await opening.createOnboardingCase(entrada);

    expect(respuesta.id).toBe('caso-1');
    expect(repository.accounts.update).not.toHaveBeenCalled();
    expect(respuesta.carpetaDelComercio).toMatchObject({ reason: 'SIN_CORREO_DE_CONTACTO' });
  });

  /*
   * Sin NIT, razón social o un contacto con correo Atlas no crea la carpeta, y el caso se abría
   * igual (Pablo, 2026-09-28). Ahora ni se abre: se dice qué falta.
   */
  it.each([
    ['sin NIT', { taxId: null }, 1, /el NIT/],
    ['con un NIT que no son sólo dígitos', { taxId: '1234567-1A' }, 1, /el NIT/],
    ['sin contacto con correo', {}, 0, /un contacto con correo/],
  ])('no abre el caso %s', async (_caso, cuenta, contactos, motivo) => {
    const { opening, repository, merchantFolder } = conAlta();
    repository.accounts.findByPk.mockResolvedValue({
      id: 'acc-1',
      taxId: '1023456789',
      legalName: 'Comercio SRL',
      ...EXPEDIENTE_COMPLETO,
      ...cuenta,
    } as never);
    repository.contacts.count.mockResolvedValue(contactos as never);

    await expect(opening.createOnboardingCase(entrada, 'tok')).rejects.toThrow(motivo);
    expect(
      (repository.onboardingCases as unknown as { create: jest.Mock }).create,
    ).not.toHaveBeenCalled();
    expect(merchantFolder.tryEnsureForAccount).not.toHaveBeenCalled();
  });

  /*
   * Pablo (2026-10-02): lo que el expediente exige se pide UNA vez, en el alta, y llega hecho al
   * portal del comercio. Sin matrícula, representante con poder, casa matriz o QR el caso no se
   * abre, y el 422 dice exactamente qué falta para que el operador lo complete en la cuenta.
   */
  it('sin los datos del expediente no abre el caso y nombra lo que falta', async () => {
    const { opening, repository, merchantFolder } = conAlta();
    repository.accounts.findByPk.mockResolvedValue({
      id: 'acc-1',
      taxId: '1023456789',
      legalName: 'Comercio SRL',
      ...EXPEDIENTE_COMPLETO,
      powerOfAttorneyFileId: null,
      bankQrFileId: null,
    } as never);

    await expect(opening.createOnboardingCase(entrada, 'tok')).rejects.toThrow(
      /el poder notarial del representante y el QR bancario de cobro/,
    );
    expect(merchantFolder.tryEnsureForAccount).not.toHaveBeenCalled();
  });
});

/*
 * Pablo (2026-09-28): «se suben supuestamente los archivos pero no aparecen en el portal
 * administrativo». El NIT del requisito se guardaba bajo el CASO (`erp-onboarding_case-…`), un
 * dueño que AtlasBackend no sabe atar a ningún comercio: el objeto existía y ninguna carpeta lo
 * enseñaba. Ahora se guarda bajo la cuenta del caso, con la carpeta asegurada antes.
 */
