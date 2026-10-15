import { ConflictException } from '@nestjs/common';
import { claseDelRequisito } from './onboarding-checklist.rules';
import { ACTOR, type Fila, build, fila } from './onboarding.fixtures';

describe('OnboardingChecklistService · evidencia de los requisitos', () => {
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
    const { checklist } = buildConItem(item);
    await expect(
      checklist.completeChecklistItem(
        'caso-1',
        { checklistItemId: 'item-1', status: 'COMPLETED' } as never,
        ACTOR,
      ),
    ).rejects.toThrow(/REQUISITO_SIN_EVIDENCIA/);
    expect(item.update).not.toHaveBeenCalled();
  });

  it('eximirlo (WAIVED) sigue siendo posible sin archivo, y queda escrito como tal', async () => {
    const item = requisitoLegal();
    const { checklist } = buildConItem(item);
    await checklist
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
    const { checklist } = buildConItem(item);
    await checklist
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
    const { checklist, partnerClient } = buildConItem(item, forward);
    await checklist
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
    const { checklist } = buildConItem(item, forward);
    await expect(
      checklist.attachChecklistEvidence(
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
    const { checklist } = buildConItem(item);
    await checklist
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

describe('OnboardingChecklistService · el archivo del requisito cae en la carpeta del comercio', () => {
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
    const { checklist, forward, merchantFolder } = conRequisito();

    await checklist.createChecklistEvidenceUploadUrl(
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
    const { checklist, forward, merchantFolder } = conRequisito({ id: 'caso-1', accountId: null });

    await checklist.createChecklistEvidenceUploadUrl(
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
