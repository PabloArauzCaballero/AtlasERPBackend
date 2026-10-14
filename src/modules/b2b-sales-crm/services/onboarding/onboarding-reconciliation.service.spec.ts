import { ACTOR, build, fila } from './onboarding.fixtures';

describe('OnboardingReconciliationService · el acuse del portal', () => {
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
    const { reconciliation, caso, logs } = build({
      users: [concedido, rechazado],
      provisioning,
      caso: { status: 'ALTA_PENDIENTE' },
    });

    const result = await reconciliation.reconcileCaseIdentity('caso-1', 'tok', ACTOR);

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
    const { reconciliation, logs, identityClient } = build({
      users: [activo],
      caso: { status: 'LISTO', identityAcknowledgedAt: new Date() },
    });
    await reconciliation.reconcileCaseIdentity('caso-1', 'tok', ACTOR);
    expect(identityClient.getMerchantUserProvisioning).not.toHaveBeenCalled();
    expect(logs.record).not.toHaveBeenCalled();
  });
});
