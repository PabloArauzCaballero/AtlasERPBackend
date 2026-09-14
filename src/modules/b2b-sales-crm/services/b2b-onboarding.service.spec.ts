import { ConflictException, ForbiddenException } from '@nestjs/common';
import { B2BOnboardingService } from './b2b-onboarding.service';

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

function build(
  overrides: {
    caso?: Record<string, unknown>;
    users?: Fila[];
    forward?: jest.Mock;
    provisioning?: jest.Mock;
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
    account: { id: 'acc-1', taxId: '123', partnerProfileId: 'p-9', update: jest.fn() },
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
    accounts: {},
    findActiveContractVersion: jest.fn(async () => null),
    transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(undefined)),
  };
  const logger = { infoContext: jest.fn() };
  const identityClient = { getMerchantUserProvisioning: overrides.provisioning ?? jest.fn() };
  const logs = { record: jest.fn() };
  const partnerClient = { forward: overrides.forward ?? jest.fn() };
  const service = new B2BOnboardingService(
    repository as never,
    logger as never,
    identityClient as never,
    logs as never,
    partnerClient as never,
  );
  return { service, caso, repository, partnerClient, logs, identityClient };
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
