import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ACTOR, DECISION, build } from './onboarding.fixtures';

describe('KybVerificationService · el tramo del Motor', () => {
  it('pide el KYB por AtlasBackend, lee `evaluatedAt` y pasa el caso a VERIFICADO', async () => {
    const forward = jest.fn(async () => ({
      partnerId: 'p-9',
      onboardingStatus: 'approved',
      decision: DECISION,
    }));
    const { kyb, caso, partnerClient, logs } = build({ forward });

    await kyb.requestKybReview('caso-1', { reason: 'alta comercial' }, 'tok', ACTOR);

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
    await rechazo.kyb.requestKybReview('caso-1', {}, 'tok', ACTOR);
    expect(rechazo.caso.status).toBe('RECHAZADO');

    const revision = build({
      forward: jest.fn(async () => ({
        decision: { ...DECISION, outcome: 'REVISION_MANUAL', manualReviewCaseCode: 'MRC-1' },
      })),
    });
    await revision.kyb.requestKybReview('caso-1', {}, 'tok', ACTOR);
    expect(revision.caso.status).toBe('REVISION_MANUAL');
    expect(revision.caso.manualReviewCaseCode).toBe('MRC-1');

    const caido = build({
      forward: jest.fn(async () => {
        throw new Error('DECISION_ENGINE_UNAVAILABLE');
      }),
    });
    await expect(caido.kyb.requestKybReview('caso-1', {}, 'tok', ACTOR)).rejects.toThrow(
      'DECISION_ENGINE_UNAVAILABLE',
    );
    // Vuelve a donde estaba: EN_VERIFICACION sin veredicto era un callejón sin salida (sin botón
    // para volver a pedir y sin nada que sincronizar). Y sigue sin aprobarse solo.
    expect(caido.caso.status).toBe('OPEN');
    expect(caido.caso.decisionOutcome).toBeNull();
  });

  it('un caso que quedó atascado EN_VERIFICACION admite volver a pedir la verificación', async () => {
    const forward = jest.fn(async () => ({ decision: DECISION }));
    const { kyb, caso } = build({ forward, caso: { status: 'EN_VERIFICACION' } });

    await kyb.requestKybReview('caso-1', {}, 'tok', ACTOR);

    expect(forward).toHaveBeenCalledTimes(1);
    expect(caso.status).toBe('VERIFICADO');
  });

  it('un desenlace que el ERP no conoce —o vacío— deja el caso en REVISION_MANUAL, nunca en el limbo', async () => {
    const vacio = build({
      forward: jest.fn(async () => ({ decision: { ...DECISION, outcome: '', reason: null } })),
    });
    await vacio.kyb.requestKybReview('caso-1', {}, 'tok', ACTOR);
    expect(vacio.caso.status).toBe('REVISION_MANUAL');
    expect(vacio.caso.decisionOutcome).toBe('REVISION_MANUAL');
    expect(vacio.caso.decisionReason).toBe('DESENLACE_DESCONOCIDO:vacio');

    const nuevo = build({
      forward: jest.fn(async () => ({
        decision: { ...DECISION, outcome: 'DESENLACE_NUEVO', reason: 'lo que sea' },
      })),
    });
    await nuevo.kyb.requestKybReview('caso-1', {}, 'tok', ACTOR);
    expect(nuevo.caso.status).toBe('REVISION_MANUAL');
    expect(nuevo.caso.decisionReason).toBe('DESENLACE_DESCONOCIDO:DESENLACE_NUEVO');
  });

  it('el 403 de AtlasBackend dice QUÉ permiso falta, y el caso vuelve a donde estaba', async () => {
    const { kyb, caso } = build({
      forward: jest.fn(async () => {
        throw new ForbiddenException(
          'El usuario interno no tiene los permisos requeridos para esta operación.',
        );
      }),
    });

    await expect(kyb.requestKybReview('caso-1', {}, 'tok', ACTOR)).rejects.toThrow(
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
    const { kyb, caso, partnerClient } = build({
      forward,
      caso: { account: { id: 'acc-1', taxId: '123', partnerProfileId: null, update: jest.fn() } },
    });

    await kyb.requestKybReview('caso-1', {}, 'tok', ACTOR);

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
    const { kyb, caso } = build({
      forward,
      caso: { account: { id: 'acc-1', taxId: null, partnerProfileId: null, update: jest.fn() } },
    });
    await expect(kyb.requestKybReview('caso-1', {}, 'tok', ACTOR)).rejects.toThrow(
      ConflictException,
    );
    expect(caso.status).toBe('OPEN');
  });

  it('`sync` lee `profile.decision` de status y un APROBADO tardío no retrocede un caso que ya pidió credenciales', async () => {
    const forward = jest.fn(async () => ({ profile: { decision: DECISION } }));
    const { kyb, caso } = build({
      forward,
      caso: {
        status: 'ALTA_PENDIENTE',
        decisionOutcome: 'REVISION_MANUAL',
        manualReviewCaseCode: 'MRC-1',
      },
    });

    const result = await kyb.syncKybDecision('caso-1', 'tok');

    expect(result.changed).toBe(true);
    expect(caso.decisionOutcome).toBe('APROBADO');
    expect(caso.status).toBe('ALTA_PENDIENTE');
  });

  it('si el expediente ya se decidió en Atlas (PARTNER_NOT_UNDER_REVIEW) trae el veredicto en vez de dejar el caso OPEN sin salida', async () => {
    const forward = jest.fn(async ({ method, path }: { method: string; path: string }) => {
      if (method === 'POST' && path.endsWith('/kyb-review')) {
        throw new ConflictException('PARTNER_NOT_UNDER_REVIEW: el expediente está en approved.');
      }
      return { profile: { decision: DECISION } };
    });
    const { kyb, caso } = build({ forward });

    await kyb.requestKybReview('caso-1', {}, 'tok', ACTOR);

    expect(caso.decisionOutcome).toBe('APROBADO');
    expect(caso.status).toBe('VERIFICADO');
  });

  it('PARTNER_NOT_UNDER_REVIEW sin veredicto que traer conserva el 409 original y el caso no se mueve', async () => {
    const forward = jest.fn(async ({ method, path }: { method: string; path: string }) => {
      if (method === 'POST' && path.endsWith('/kyb-review')) {
        throw new ConflictException('PARTNER_NOT_UNDER_REVIEW: el expediente está en draft.');
      }
      return { profile: { decision: null } };
    });
    const { kyb, caso } = build({ forward });

    await expect(kyb.requestKybReview('caso-1', {}, 'tok', ACTOR)).rejects.toThrow(
      ConflictException,
    );
    expect(caso.status).toBe('OPEN');
    expect(caso.decisionOutcome).toBeNull();
  });

  it('otro 409 de Atlas no se confunde con un expediente ya decidido', async () => {
    const forward = jest.fn(async () => {
      throw new ConflictException('KYB_REQUISITOS_INCOMPLETOS: faltan documentos.');
    });
    const { kyb, caso } = build({ forward });

    await expect(kyb.requestKybReview('caso-1', {}, 'tok', ACTOR)).rejects.toThrow(
      'KYB_REQUISITOS_INCOMPLETOS',
    );
    expect(caso.status).toBe('OPEN');
    expect(forward).toHaveBeenCalledTimes(1);
  });
});
