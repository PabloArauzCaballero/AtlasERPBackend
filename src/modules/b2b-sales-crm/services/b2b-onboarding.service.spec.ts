import { ConflictException, ForbiddenException } from '@nestjs/common';
import { B2BOnboardingService, claseDelRequisito } from './b2b-onboarding.service';

/**
 * El tramo del Motor y el del portal, con AtlasBackend FINGIDO con la forma exacta que publica
 * (`decision.evaluatedAt`, `profile.decision` en `status`, `{items}` en la búsqueda).
 *
 * Estas rutas exigen la cookie upstream y contra un proceso local sólo se pueden llevar hasta el
 * 401; el desajuste de forma con AtlasBackend sólo aparecería en dev. Aquí se fija la forma que se
 * acordó, para que si allá cambia un nombre esto falle antes que la cola.
 */
type Fila = Record<string, unknown> & { update: jest.Mock };
const fila = (values: Record<string, unknown>): Fila => {
  const row: Fila = { ...values, update: jest.fn() };
  row.update.mockImplementation(async (patch: Record<string, unknown>) =>
    Object.assign(row, patch),
  );
  return row;
};

const ACTOR = { sub: '1', role: 'ADMIN', email: 'a@b.c' } as never;
const DECISION = {
  outcome: 'APROBADO',
  reason: 'KYB_COMPLETO',
  executionId: 'exec-77',
  artifactVersionId: 'v3',
  manualReviewCaseCode: null,
  evaluatedAt: '2026-09-09T12:00:00.000Z',
};

/** Lo que la compuerta del onboarding exige desde el 2026-10-02: el expediente capturado en la cuenta. */
const EXPEDIENTE_COMPLETO = {
  commercialRegistry: '00008022',
  legalRepFullName: 'Pablo Arauz Caballero',
  legalRepDocumentType: 'ci',
  legalRepDocumentNumber: '1234567',
  powerOfAttorneyFileId: '8b8f0f5e-3f55-4a47-9c3a-1b6f0b0e2a11',
  address: 'Av. Banzer km 2 1/2',
  city: 'Santa Cruz',
  bankQrFileId: '8b8f0f5e-3f55-4a47-9c3a-1b6f0b0e2a12',
  bankInstitutionCode: 'BNB',
  bankAccountMasked: '****0739',
};

function build(
  overrides: {
    caso?: Record<string, unknown>;
    users?: Fila[];
    forward?: jest.Mock;
    provisioning?: jest.Mock;
    folder?: jest.Mock;
  } = {},
) {
  const caso = fila({
    id: 'caso-1',
    accountId: 'acc-1',
    status: 'OPEN',
    contractVersionId: null,
    decisionOutcome: null,
    decisionExecutionId: null,
    manualReviewCaseCode: null,
    identityAcknowledgedAt: null,
    checklistItems: [],
    account: {
      id: 'acc-1',
      taxId: '123',
      partnerProfileId: 'p-9',
      update: jest.fn(),
      ...EXPEDIENTE_COMPLETO,
    },
    ...overrides.caso,
  });
  const users = overrides.users ?? [];
  const repository = {
    onboardingCases: {
      findByPk: jest.fn(async () => caso),
      findAll: jest.fn(async () => [caso]),
      update: jest.fn(),
    },
    merchantUsers: { findAll: jest.fn(async () => users) },
    contractVersions: { findOne: jest.fn(async () => null) },
    contracts: {},
    checklistItems: {},
    contacts: { count: jest.fn(async () => 1) },
    accounts: {
      findByPk: jest.fn(async () => caso.account),
      update: jest.fn(async () => [1]),
    },
    findActiveContractVersion: jest.fn(async () => null),
    transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(undefined)),
  };
  const logger = { infoContext: jest.fn() };
  const identityClient = { getMerchantUserProvisioning: overrides.provisioning ?? jest.fn() };
  const logs = { record: jest.fn() };
  const partnerClient = { forward: overrides.forward ?? jest.fn() };
  const merchantFolder = {
    tryEnsureForAccount:
      overrides.folder ??
      jest.fn(async () => ({
        partnerId: 'p-9',
        expedienteId: 'e-1',
        created: false,
        reason: null,
      })),
  };
  const service = new B2BOnboardingService(
    repository as never,
    logger as never,
    identityClient as never,
    logs as never,
    partnerClient as never,
    merchantFolder as never,
  );
  return { service, caso, repository, partnerClient, logs, identityClient, merchantFolder };
}

describe('B2BOnboardingService · el tramo del Motor', () => {
  it('pide el KYB por AtlasBackend, lee `evaluatedAt` y pasa el caso a VERIFICADO', async () => {
    const forward = jest.fn(async () => ({
      partnerId: 'p-9',
      onboardingStatus: 'approved',
      decision: DECISION,
    }));
    const { service, caso, partnerClient, logs } = build({ forward });

    await service.requestKybReview('caso-1', { reason: 'alta comercial' }, 'tok', ACTOR);

    expect(partnerClient.forward).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: 'operations/partners/p-9/kyb-review',
        body: { reason: 'alta comercial' },
      }),
    );
    expect(caso.status).toBe('VERIFICADO');
    expect(caso.decisionOutcome).toBe('APROBADO');
    expect(caso.decisionExecutionId).toBe('exec-77');
    expect(caso.decidedAt).toEqual(new Date(DECISION.evaluatedAt));
    expect(logs.record).toHaveBeenCalledWith(
      expect.objectContaining({ actionCode: 'REQUEST_KYB_REVIEW' }),
    );
  });

  it('RECHAZADO y REVISION_MANUAL llevan a su estado, y el caso queda EN_VERIFICACION si AtlasBackend falla', async () => {
    const rechazo = build({
      forward: jest.fn(async () => ({
        decision: { ...DECISION, outcome: 'RECHAZADO', reason: 'KYB_REQUISITOS_INCOMPLETOS' },
      })),
    });
    await rechazo.service.requestKybReview('caso-1', {}, 'tok', ACTOR);
    expect(rechazo.caso.status).toBe('RECHAZADO');

    const revision = build({
      forward: jest.fn(async () => ({
        decision: { ...DECISION, outcome: 'REVISION_MANUAL', manualReviewCaseCode: 'MRC-1' },
      })),
    });
    await revision.service.requestKybReview('caso-1', {}, 'tok', ACTOR);
    expect(revision.caso.status).toBe('REVISION_MANUAL');
    expect(revision.caso.manualReviewCaseCode).toBe('MRC-1');

    const caido = build({
      forward: jest.fn(async () => {
        throw new Error('DECISION_ENGINE_UNAVAILABLE');
      }),
    });
    await expect(caido.service.requestKybReview('caso-1', {}, 'tok', ACTOR)).rejects.toThrow(
      'DECISION_ENGINE_UNAVAILABLE',
    );
    // Vuelve a donde estaba: EN_VERIFICACION sin veredicto era un callejón sin salida (sin botón
    // para volver a pedir y sin nada que sincronizar). Y sigue sin aprobarse solo.
    expect(caido.caso.status).toBe('OPEN');
    expect(caido.caso.decisionOutcome).toBeNull();
  });

  it('un caso que quedó atascado EN_VERIFICACION admite volver a pedir la verificación', async () => {
    const forward = jest.fn(async () => ({ decision: DECISION }));
    const { service, caso } = build({ forward, caso: { status: 'EN_VERIFICACION' } });

    await service.requestKybReview('caso-1', {}, 'tok', ACTOR);

    expect(forward).toHaveBeenCalledTimes(1);
    expect(caso.status).toBe('VERIFICADO');
  });

  it('un desenlace que el ERP no conoce —o vacío— deja el caso en REVISION_MANUAL, nunca en el limbo', async () => {
    const vacio = build({
      forward: jest.fn(async () => ({ decision: { ...DECISION, outcome: '', reason: null } })),
    });
    await vacio.service.requestKybReview('caso-1', {}, 'tok', ACTOR);
    expect(vacio.caso.status).toBe('REVISION_MANUAL');
    expect(vacio.caso.decisionOutcome).toBe('REVISION_MANUAL');
    expect(vacio.caso.decisionReason).toBe('DESENLACE_DESCONOCIDO:vacio');

    const nuevo = build({
      forward: jest.fn(async () => ({
        decision: { ...DECISION, outcome: 'DESENLACE_NUEVO', reason: 'lo que sea' },
      })),
    });
    await nuevo.service.requestKybReview('caso-1', {}, 'tok', ACTOR);
    expect(nuevo.caso.status).toBe('REVISION_MANUAL');
    expect(nuevo.caso.decisionReason).toBe('DESENLACE_DESCONOCIDO:DESENLACE_NUEVO');
  });

  it('el 403 de AtlasBackend dice QUÉ permiso falta, y el caso vuelve a donde estaba', async () => {
    const { service, caso } = build({
      forward: jest.fn(async () => {
        throw new ForbiddenException(
          'El usuario interno no tiene los permisos requeridos para esta operación.',
        );
      }),
    });

    await expect(service.requestKybReview('caso-1', {}, 'tok', ACTOR)).rejects.toThrow(
      /partner\.kyb\.request/,
    );
    expect(caso.status).toBe('OPEN');
  });

  it('sin expediente enlazado lo busca por cuenta y luego por NIT, y escribe el puente en los dos lados', async () => {
    const forward = jest
      .fn()
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({
        items: [{ partnerId: 'p-42', onboardingStatus: 'under_review', erpAccountId: null }],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ decision: DECISION });
    const { service, caso, partnerClient } = build({
      forward,
      caso: { account: { id: 'acc-1', taxId: '123', partnerProfileId: null, update: jest.fn() } },
    });

    await service.requestKybReview('caso-1', {}, 'tok', ACTOR);

    const paths = partnerClient.forward.mock.calls.map((call: [{ path: string }]) => call[0].path);
    expect(paths).toEqual([
      'operations/partners?erpAccountId=acc-1',
      'operations/partners?taxId=123',
      'operations/partners/p-42/erp-account',
      'operations/partners/p-42/kyb-review',
    ]);
    expect((caso.account as { update: jest.Mock }).update).toHaveBeenCalledWith({
      partnerProfileId: 'p-42',
    });
  });

  it('sin expediente en Atlas es un 409 que lo dice, no un 500', async () => {
    const forward = jest.fn(async () => ({ items: [] }));
    const { service, caso } = build({
      forward,
      caso: { account: { id: 'acc-1', taxId: null, partnerProfileId: null, update: jest.fn() } },
    });
    await expect(service.requestKybReview('caso-1', {}, 'tok', ACTOR)).rejects.toThrow(
      ConflictException,
    );
    expect(caso.status).toBe('OPEN');
  });

  it('`sync` lee `profile.decision` de status y un APROBADO tardío no retrocede un caso que ya pidió credenciales', async () => {
    const forward = jest.fn(async () => ({ profile: { decision: DECISION } }));
    const { service, caso } = build({
      forward,
      caso: {
        status: 'ALTA_PENDIENTE',
        decisionOutcome: 'REVISION_MANUAL',
        manualReviewCaseCode: 'MRC-1',
      },
    });

    const result = await service.syncKybDecision('caso-1', 'tok');

    expect(result.changed).toBe(true);
    expect(caso.decisionOutcome).toBe('APROBADO');
    expect(caso.status).toBe('ALTA_PENDIENTE');
  });
});

describe('B2BOnboardingService · el acuse del portal', () => {
  it('aplica lo concedido y lo rechazado, guarda el motivo, y con todo resuelto deja el caso LISTO', async () => {
    const concedido = fila({
      id: 'u1',
      email: 'a@x',
      accountId: 'acc-1',
      status: 'INVITED',
      userId: null,
      identityRequestId: '7',
    });
    const rechazado = fila({
      id: 'u2',
      email: 'b@x',
      accountId: 'acc-1',
      status: 'INVITED',
      userId: null,
      identityRequestId: '8',
    });
    const provisioning = jest
      .fn()
      .mockResolvedValueOnce({ status: 'provisioned', merchantUserId: '41', rejectionReason: null })
      .mockResolvedValueOnce({
        status: 'rejected',
        merchantUserId: null,
        rejectionReason: 'Correo ya tomado',
      });
    const { service, caso, logs } = build({
      users: [concedido, rechazado],
      provisioning,
      caso: { status: 'ALTA_PENDIENTE' },
    });

    const result = await service.reconcileCaseIdentity('caso-1', 'tok', ACTOR);

    expect(concedido.userId).toBe('41');
    expect(concedido.status).toBe('ACTIVE');
    expect(rechazado.status).toBe('DISABLED');
    expect(rechazado.identityRejectionReason).toBe('Correo ya tomado');
    expect(caso.status).toBe('LISTO');
    expect(caso.identityAcknowledgedAt).toBeInstanceOf(Date);
    expect(result.resueltos).toHaveLength(2);
    expect(logs.record).toHaveBeenCalledWith(
      expect.objectContaining({ actionCode: 'ACKNOWLEDGE_MERCHANT_CREDENTIALS' }),
    );
  });

  it('es idempotente: sin nada que resolver no escribe ni registra', async () => {
    const activo = fila({
      id: 'u1',
      email: 'a@x',
      accountId: 'acc-1',
      status: 'ACTIVE',
      userId: '41',
      identityRequestId: '7',
    });
    const { service, logs, identityClient } = build({
      users: [activo],
      caso: { status: 'LISTO', identityAcknowledgedAt: new Date() },
    });
    await service.reconcileCaseIdentity('caso-1', 'tok', ACTOR);
    expect(identityClient.getMerchantUserProvisioning).not.toHaveBeenCalled();
    expect(logs.record).not.toHaveBeenCalled();
  });
});

describe('B2BOnboardingService · la compuerta dura', () => {
  it('sin APROBADO del Motor no activa, y lo dice antes que el checklist', async () => {
    const { service } = build({ caso: { checklistItems: [{ status: 'PENDING' }] } });
    await expect(service.activateOnboardingCase('caso-1')).rejects.toThrow(
      /verificación del Motor/,
    );
  });

  it('con el Motor en contra tampoco, y nombra el desenlace', async () => {
    const { service } = build({
      caso: { decisionOutcome: 'RECHAZADO', checklistItems: [{ status: 'COMPLETED' }] },
    });
    await expect(service.activateOnboardingCase('caso-1')).rejects.toThrow(/RECHAZADO/);
  });
});

describe('B2BOnboardingService · activar el comercio habilita la venta a crédito de sus sucursales', () => {
  function activable() {
    const built = build({
      caso: { decisionOutcome: 'APROBADO', checklistItems: [{ status: 'COMPLETED' }] },
    });
    const branches = { update: jest.fn(async () => [1]) };
    Object.assign(built.repository, { branches });
    built.repository.findActiveContractVersion = jest.fn(async () => ({ id: 'cv-1' }) as never);
    jest
      .spyOn(built.service as never, 'getOnboardingCase')
      .mockResolvedValue({ id: 'caso-1' } as never);
    return { ...built, branches };
  }
  type Llamada = [Record<string, unknown>, { where: Record<string, unknown> }];
  const llamadas = (branches: { update: jest.Mock }) =>
    branches.update.mock.calls as unknown as Llamada[];

  it('las PENDING pasan a ACTIVE con su fecha de alta', async () => {
    const { service, branches } = activable();
    await service.activateOnboardingCase('caso-1');
    const [valores, opciones] = llamadas(branches)[0] as Llamada;
    expect(valores).toEqual({ status: 'ACTIVE', activatedAt: expect.any(Date) });
    expect(opciones.where).toEqual({ accountId: 'acc-1', status: 'PENDING' });
  });

  it('TODAS las ACTIVE sin la capacidad la reciben —también las que ya lo estaban—, sin reescribir su fecha', async () => {
    const { service, branches } = activable();
    await service.activateOnboardingCase('caso-1');
    const [valores, opciones] = llamadas(branches)[1] as Llamada;
    expect(valores).toEqual({ canOriginateBnpl: true });
    expect(opciones.where).toMatchObject({
      accountId: 'acc-1',
      status: 'ACTIVE',
      canOriginateBnpl: false,
    });
  });

  it('las que Atlas apagó a mano NO se reencienden al activar', async () => {
    const { service, branches } = activable();
    await service.activateOnboardingCase('caso-1');
    const [, opciones] = llamadas(branches)[1] as Llamada;
    expect(opciones.where.bnplBlockedByAtlas).toBe(false);
  });

  it('sin APROBADO del Motor no habilita ninguna: la compuerta dura corta antes', async () => {
    const built = build({ caso: { decisionOutcome: null } });
    const branches = { update: jest.fn() };
    Object.assign(built.repository, { branches });
    await expect(built.service.activateOnboardingCase('caso-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(branches.update).not.toHaveBeenCalled();
  });
});

describe('B2BOnboardingService · sucursales: la bandera de crédito sigue la regla única', () => {
  function conSucursal(branchOver: Record<string, unknown>, lifecycleStatus: string) {
    const built = build();
    const branch = fila({
      id: 'br-1',
      accountId: 'acc-1',
      name: 'Casa matriz',
      status: 'INACTIVE',
      canOriginateBnpl: false,
      bnplBlockedByAtlas: false,
      activatedAt: new Date('2026-10-01T00:00:00Z'),
      ...branchOver,
    });
    Object.assign(built.repository, { branches: { findByPk: jest.fn(async () => branch) } });
    built.repository.accounts.findByPk = jest.fn(async () => ({
      id: 'acc-1',
      lifecycleStatus,
    })) as never;
    return { ...built, branch };
  }

  it('dar de alta una sucursal de un comercio APROBADO la deja vendiendo', async () => {
    const { service, branch } = conSucursal({}, 'CUSTOMER');
    await service.setBranchStatus('br-1', { status: 'ACTIVE' } as never);
    expect(branch.canOriginateBnpl).toBe(true);
  });

  it('en un comercio aún no aprobado queda «Por habilitar»', async () => {
    const { service, branch } = conSucursal({}, 'QUALIFIED');
    await service.setBranchStatus('br-1', { status: 'ACTIVE' } as never);
    expect(branch.canOriginateBnpl).toBe(false);
  });

  it('si Atlas la apagó a mano, darla de alta no la reenciende', async () => {
    const { service, branch } = conSucursal({ bnplBlockedByAtlas: true }, 'CUSTOMER');
    await service.setBranchStatus('br-1', { status: 'ACTIVE' } as never);
    expect(branch.canOriginateBnpl).toBe(false);
  });

  it('darla de baja le quita el crédito siempre', async () => {
    const { service, branch } = conSucursal(
      { status: 'ACTIVE', canOriginateBnpl: true },
      'CUSTOMER',
    );
    await service.setBranchStatus('br-1', { status: 'INACTIVE' } as never);
    expect(branch.canOriginateBnpl).toBe(false);
  });

  it('Atlas apaga a mano: queda marcada y la regla no la toca; al encenderla se levanta la marca', async () => {
    const apagar = conSucursal({ status: 'ACTIVE', canOriginateBnpl: true }, 'CUSTOMER');
    await apagar.service.updateBranch('br-1', { canOriginateBnpl: false } as never);
    expect(apagar.branch).toMatchObject({ canOriginateBnpl: false, bnplBlockedByAtlas: true });

    const encender = conSucursal({ status: 'ACTIVE', bnplBlockedByAtlas: true }, 'CUSTOMER');
    await encender.service.updateBranch('br-1', { canOriginateBnpl: true } as never);
    expect(encender.branch).toMatchObject({ canOriginateBnpl: true, bnplBlockedByAtlas: false });
  });

  it('editar otros datos no toca ni la bandera ni la marca', async () => {
    const { service, branch } = conSucursal(
      { status: 'ACTIVE', canOriginateBnpl: true },
      'CUSTOMER',
    );
    await service.updateBranch('br-1', { name: 'Otro nombre' } as never);
    expect(branch).toMatchObject({
      name: 'Otro nombre',
      canOriginateBnpl: true,
      bnplBlockedByAtlas: false,
    });
  });
});

describe('B2BOnboardingService · el contrato legal por defecto', () => {
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
    const { service } = build({ forward });
    const result = await service.getDefaultLegalContractTemplate('tok');
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
    const { service } = build({ forward: jest.fn(async () => ({ template: null })) });
    expect(await service.getDefaultLegalContractTemplate('tok')).toEqual({ template: null });
  });
});

describe('B2BOnboardingService · pedir credenciales', () => {
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
    const service = new B2BOnboardingService(
      repository as never,
      { infoContext: jest.fn() } as never,
      { enqueueMerchantUserProvisioning: enqueue } as never,
      { record: jest.fn() } as never,
      { forward: jest.fn() } as never,
      { tryEnsureForAccount: jest.fn() } as never,
    );
    return { service, repository, user };
  }

  it('el 403 de AtlasBackend dice qué permiso falta y la fila del CRM no queda a medias', async () => {
    const { service, repository } = buildAlta(
      jest.fn(async () => {
        throw new ForbiddenException('El usuario interno no tiene los permisos requeridos.');
      }),
    );

    await expect(
      service.createMerchantUser(
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
    const { service } = buildAlta(
      jest.fn(async () => {
        throw new ConflictException('Ya hay una petición pendiente para ese correo.');
      }),
    );
    await expect(
      service.createMerchantUser(
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

describe('B2BOnboardingService · evidencia de los requisitos', () => {
  const requisitoLegal = () =>
    fila({
      id: 'item-1',
      onboardingCaseId: 'caso-1',
      itemType: 'LEGAL',
      description: 'NIT vigente',
      status: 'PENDING',
      evidenceStorageKey: null,
    });

  function buildConItem(item: Fila, forward?: jest.Mock) {
    const built = build({ forward });
    const repository = built.repository as unknown as {
      checklistItems: Record<string, unknown>;
      internalUsers?: Record<string, unknown>;
    };
    repository.checklistItems.findOne = jest.fn(async () => item);
    repository.internalUsers = {
      findOne: jest.fn(async () => ({ id: 'iu-1' })),
      create: jest.fn(),
    };
    return built;
  }

  it('un requisito documental NO se completa sin archivo: 409 REQUISITO_SIN_EVIDENCIA', async () => {
    const item = requisitoLegal();
    const { service } = buildConItem(item);
    await expect(
      service.completeChecklistItem(
        'caso-1',
        { checklistItemId: 'item-1', status: 'COMPLETED' } as never,
        ACTOR,
      ),
    ).rejects.toThrow(/REQUISITO_SIN_EVIDENCIA/);
    expect(item.update).not.toHaveBeenCalled();
  });

  it('eximirlo (WAIVED) sigue siendo posible sin archivo, y queda escrito como tal', async () => {
    const item = requisitoLegal();
    const { service } = buildConItem(item);
    await service
      .completeChecklistItem(
        'caso-1',
        { checklistItemId: 'item-1', status: 'WAIVED' } as never,
        ACTOR,
      )
      .catch(() => undefined);
    expect(item.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'WAIVED' }));
  });

  it('un requisito operativo se completa sin archivo', async () => {
    const item = fila({
      id: 'item-2',
      itemType: 'VISITA',
      description: 'Visita al local',
      status: 'PENDING',
      evidenceStorageKey: null,
    });
    const { service } = buildConItem(item);
    await service
      .completeChecklistItem(
        'caso-1',
        { checklistItemId: 'item-2', status: 'COMPLETED' } as never,
        ACTOR,
      )
      .catch(() => undefined);
    expect(item.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'COMPLETED' }));
  });

  it('adjuntar la evidencia pide a AtlasBackend que VERIFIQUE el objeto antes de registrarlo', async () => {
    const item = requisitoLegal();
    const forward = jest.fn(async () => ({
      sizeBytes: 4321,
      sha256: 'AB'.repeat(32),
      contentType: 'application/pdf',
    }));
    const { service, partnerClient } = buildConItem(item, forward);
    await service
      .attachChecklistEvidence(
        'caso-1',
        'item-1',
        {
          storageKey: '1/erp-onboarding_case-caso-1/legal/x.pdf',
          sha256: 'ab'.repeat(32),
          contentType: 'application/pdf',
          sizeBytes: 4321,
        },
        'token-upstream',
      )
      .catch(() => undefined);
    expect(partnerClient.forward).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: 'operations/erp-documents/verify',
        accessToken: 'token-upstream',
      }),
    );
    expect(item.update).toHaveBeenCalledWith(
      expect.objectContaining({
        evidenceStorageKey: '1/erp-onboarding_case-caso-1/legal/x.pdf',
        evidenceSizeBytes: 4321,
      }),
    );
  });

  it('si AtlasBackend rechaza el objeto, el requisito queda sin evidencia', async () => {
    const item = requisitoLegal();
    const forward = jest.fn(async () => {
      throw new ConflictException('EVIDENCE_HASH_MISMATCH');
    });
    const { service } = buildConItem(item, forward);
    await expect(
      service.attachChecklistEvidence(
        'caso-1',
        'item-1',
        {
          storageKey: '1/erp-onboarding_case-caso-1/legal/x.pdf',
          sha256: 'ab'.repeat(32),
          contentType: 'application/pdf',
          sizeBytes: 1,
        },
        'token',
      ),
    ).rejects.toThrow('EVIDENCE_HASH_MISMATCH');
    expect(item.update).not.toHaveBeenCalled();
  });

  it('con archivo registrado, el requisito documental sí se completa', async () => {
    const item = fila({
      ...requisitoLegal(),
      evidenceStorageKey: '1/erp-onboarding_case-caso-1/legal/x.pdf',
    });
    const { service } = buildConItem(item);
    await service
      .completeChecklistItem(
        'caso-1',
        { checklistItemId: 'item-1', status: 'COMPLETED' } as never,
        ACTOR,
      )
      .catch(() => undefined);
    expect(item.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'COMPLETED' }));
  });
});

/*
 * La carpeta del comercio en Atlas nace con el onboarding (Pablo, 2026-09-26): ahí cae el contrato
 * firmado. Se asegura después de abrir el caso y sin poder tumbarlo.
 */
describe('B2BOnboardingService · la carpeta del comercio al abrir el caso', () => {
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
    const { service, merchantFolder, repository } = conAlta();

    await expect(service.createOnboardingCase(entrada, 'tok')).rejects.toThrow(
      /oportunidad ganada/,
    );
    expect(
      (repository.onboardingCases as unknown as { create: jest.Mock }).create,
    ).not.toHaveBeenCalled();
    expect(merchantFolder.tryEnsureForAccount).not.toHaveBeenCalled();
  });

  it('asegura la carpeta con el token de la sesión, guarda el puente y lo cuenta en la respuesta', async () => {
    const { service, merchantFolder, repository } = conAlta();

    const respuesta = await service.createOnboardingCase(entrada, 'tok');

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
    const { service, repository } = conAlta(folder);

    const respuesta = await service.createOnboardingCase(entrada);

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
    const { service, repository, merchantFolder } = conAlta();
    repository.accounts.findByPk.mockResolvedValue({
      id: 'acc-1',
      taxId: '1023456789',
      legalName: 'Comercio SRL',
      ...EXPEDIENTE_COMPLETO,
      ...cuenta,
    } as never);
    repository.contacts.count.mockResolvedValue(contactos as never);

    await expect(service.createOnboardingCase(entrada, 'tok')).rejects.toThrow(motivo);
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
    const { service, repository, merchantFolder } = conAlta();
    repository.accounts.findByPk.mockResolvedValue({
      id: 'acc-1',
      taxId: '1023456789',
      legalName: 'Comercio SRL',
      ...EXPEDIENTE_COMPLETO,
      powerOfAttorneyFileId: null,
      bankQrFileId: null,
    } as never);

    await expect(service.createOnboardingCase(entrada, 'tok')).rejects.toThrow(
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
describe('B2BOnboardingService · el archivo del requisito cae en la carpeta del comercio', () => {
  const requisito = fila({
    id: 'item-1',
    onboardingCaseId: 'caso-1',
    itemType: 'LEGAL',
    description: 'NIT vigente del comercio',
  });

  function conRequisito(
    caso: Record<string, unknown> | null = { id: 'caso-1', accountId: 'acc-1' },
  ) {
    const forward = jest.fn(async () => ({ storageKey: 'k', uploadUrl: 'u' }));
    const ctx = build({ forward });
    Object.assign(ctx.repository.checklistItems, { findOne: jest.fn(async () => requisito) });
    ctx.repository.onboardingCases.findByPk = jest.fn(async () => caso) as never;
    return { ...ctx, forward };
  }

  it('pide el permiso bajo la cuenta B2B del caso, con la descripción como nombre, y asegura antes la carpeta', async () => {
    const { service, forward, merchantFolder } = conRequisito();

    await service.createChecklistEvidenceUploadUrl(
      'caso-1',
      'item-1',
      { contentType: 'application/pdf', sizeBytes: 100 } as never,
      'tok',
    );

    expect(merchantFolder.tryEnsureForAccount).toHaveBeenCalledWith('acc-1', 'tok');
    expect(forward).toHaveBeenCalledWith({
      method: 'POST',
      path: 'operations/erp-documents/upload-url',
      accessToken: 'tok',
      body: {
        ownerType: 'b2b_account',
        ownerId: 'acc-1',
        documentKind: 'NIT-vigente-del-comercio',
        contentType: 'application/pdf',
        sizeBytes: 100,
      },
    });
    // La carpeta se asegura ANTES de firmar: si no, el archivo llegaría a un comercio sin carpeta.
    const ordenCarpeta = merchantFolder.tryEnsureForAccount.mock.invocationCallOrder[0];
    expect(ordenCarpeta).toBeLessThan(forward.mock.invocationCallOrder[0] ?? 0);
  });

  it('sin cuenta en el caso se guarda bajo el caso, como antes, y no pide carpeta', async () => {
    const { service, forward, merchantFolder } = conRequisito({ id: 'caso-1', accountId: null });

    await service.createChecklistEvidenceUploadUrl(
      'caso-1',
      'item-1',
      { contentType: 'image/png', sizeBytes: 10 } as never,
      'tok',
    );

    expect(merchantFolder.tryEnsureForAccount).not.toHaveBeenCalled();
    expect(forward).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ ownerType: 'ONBOARDING_CASE', ownerId: 'caso-1' }),
      }),
    );
  });

  it.each([
    ['NIT vigente del comercio', 'LEGAL', 'NIT-vigente-del-comercio'],
    [
      'Poder del representante legal (notariado)',
      'LEGAL',
      'Poder-del-representante-legal-notariado',
    ],
    ['Matrícula de comercio · SEPREC', 'LEGAL', 'Matricula-de-comercio-SEPREC'],
    ['', 'BANKING', 'BANKING'],
    [null, 'BANKING', 'BANKING'],
  ])('claseDelRequisito(%p, %p) → %p', (descripcion, tipo, esperado) => {
    const clase = claseDelRequisito(descripcion, tipo);
    expect(clase).toBe(esperado);
    // Es un tramo de la ruta del objeto: AtlasBackend rechaza cualquier otra cosa.
    expect(clase).toMatch(/^[A-Za-z0-9_-]{1,80}$/);
  });
});

describe('B2BOnboardingService · la cola de onboarding', () => {
  it('cada requisito de la cola dice si pide archivo y si ya lo tiene, como el detalle', async () => {
    const { service, repository } = build();
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

    const result = (await service.listOnboardingCases({
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
