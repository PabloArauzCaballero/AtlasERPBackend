import {
  ONBOARDING_CASE_STATUSES,
  describeCredentials,
  isReadyToActivate,
  summarizeCredentials,
  statusesForScope,
  summarizeOnboardingQueue,
  normalizeKybOutcome,
  STATUSES_THAT_CAN_REQUEST_KYB,
} from './onboarding-lifecycle';

/**
 * La cola de onboarding sólo enseña lo que falta por hacer.
 *
 * La queja que originó esto: dos comercios ya activados (`COMPLETED`, con `completedAt`) salían en
 * la misma tabla que los pendientes. Estas pruebas fijan la regla en el dominio, que es donde la
 * pantalla y el endpoint la toman, para que ninguno de los dos pueda volver a mezclarlos.
 */
describe('Ciclo de vida del caso de onboarding', () => {
  it('«abiertos» excluye COMPLETED y nada más', () => {
    const abiertos = statusesForScope('abiertos');
    expect(abiertos).not.toContain('COMPLETED');
    expect(abiertos.length).toBe(ONBOARDING_CASE_STATUSES.length - 1);
  });

  it('«historial» es sólo COMPLETED y «todos» es todo', () => {
    expect(statusesForScope('historial')).toEqual(['COMPLETED']);
    expect(statusesForScope('todos')).toEqual(ONBOARDING_CASE_STATUSES);
  });

  it('los valores heredados IN_PROGRESS y BLOCKED siguen contando como abiertos', () => {
    // Son filas anteriores al vocabulario nuevo; no se migran y no pueden desaparecer de la cola.
    expect(statusesForScope('abiertos')).toEqual(
      expect.arrayContaining(['IN_PROGRESS', 'BLOCKED']),
    );
  });

  it('el resumen cuenta con la misma regla que la activación', () => {
    const summary = summarizeOnboardingQueue([
      { status: 'COMPLETED', pendingItems: 0, hasActiveContract: true, motorApproved: true },
      { status: 'COMPLETED', pendingItems: 0, hasActiveContract: true, motorApproved: true },
      { status: 'OPEN', pendingItems: 2, hasActiveContract: false, motorApproved: false },
      { status: 'VERIFICADO', pendingItems: 0, hasActiveContract: true, motorApproved: true },
      { status: 'EN_VERIFICACION', pendingItems: 0, hasActiveContract: true, motorApproved: false },
      { status: 'REVISION_MANUAL', pendingItems: 1, hasActiveContract: true, motorApproved: false },
      { status: 'BLOCKED', pendingItems: 1, hasActiveContract: false, motorApproved: false },
      { status: 'LISTO', pendingItems: 0, hasActiveContract: true, motorApproved: true },
      { status: 'ALTA_PENDIENTE', pendingItems: 0, hasActiveContract: false, motorApproved: true },
    ]);

    expect(summary).toEqual({
      abiertos: 7,
      esperandoMotor: 1,
      revisionManual: 2,
      esperandoCredenciales: 1,
      listosParaActivar: 2,
      activados: 2,
    });
  });

  it('un caso COMPLETED nunca está «listo para activar», aunque cumpla todo', () => {
    expect(
      isReadyToActivate({
        status: 'COMPLETED',
        pendingItems: 0,
        hasActiveContract: true,
        motorApproved: true,
      }),
    ).toBe(false);
  });

  it('sin contrato vigente no está listo, por limpio que esté el checklist', () => {
    expect(
      isReadyToActivate({
        status: 'OPEN',
        pendingItems: 0,
        hasActiveContract: false,
        motorApproved: true,
      }),
    ).toBe(false);
  });

  it('sin APROBADO del Motor no está listo: es la compuerta dura', () => {
    expect(
      isReadyToActivate({
        status: 'OPEN',
        pendingItems: 0,
        hasActiveContract: true,
        motorApproved: false,
      }),
    ).toBe(false);
    expect(
      isReadyToActivate({
        status: 'VERIFICADO',
        pendingItems: 0,
        hasActiveContract: true,
        motorApproved: true,
      }),
    ).toBe(true);
  });

  it('las credenciales se cuentan sólo sobre los usuarios con petición encolada', () => {
    const summary = summarizeCredentials([
      { status: 'ACTIVE', identityRequestId: null, userId: null }, // anterior a la cola: no cuenta
      { status: 'INVITED', identityRequestId: '7', userId: null },
      { status: 'ACTIVE', identityRequestId: '8', userId: '41' },
      {
        status: 'DISABLED',
        identityRequestId: '9',
        userId: null,
        rejectionReason: 'Correo ya tomado',
      },
    ]);
    expect(summary).toEqual({
      pedidas: 3,
      pendientes: 1,
      concedidas: 1,
      rechazadas: 1,
      motivosRechazo: ['Correo ya tomado'],
    });
    expect(describeCredentials(summary)).toBe(
      '1 concedida · 1 pendiente · 1 rechazada (Correo ya tomado)',
    );
    expect(describeCredentials(summarizeCredentials([]))).toBe('Sin pedir');
  });

  it('un desenlace que no es de los tres conocidos —o vacío— se trata como REVISION_MANUAL', () => {
    expect(normalizeKybOutcome('APROBADO')).toBe('APROBADO');
    expect(normalizeKybOutcome(' rechazado ')).toBe('RECHAZADO');
    expect(normalizeKybOutcome('REVISION_MANUAL')).toBe('REVISION_MANUAL');
    // Lo que rompía la cola: `STATUS_FOR_KYB_OUTCOME['']` daba `undefined` y el caso se quedaba
    // EN_VERIFICACION con un `decision_outcome` vacío persistido.
    expect(normalizeKybOutcome('')).toBe('REVISION_MANUAL');
    expect(normalizeKybOutcome(null)).toBe('REVISION_MANUAL');
    expect(normalizeKybOutcome('DESENLACE_NUEVO_DEL_ARTEFACTO')).toBe('REVISION_MANUAL');
  });

  it('un caso atascado EN_VERIFICACION puede volver a pedir la verificación', () => {
    expect(STATUSES_THAT_CAN_REQUEST_KYB).toContain('EN_VERIFICACION');
    // Con veredicto ya no se vuelve a pedir desde aquí: VERIFICADO y REVISION_MANUAL siguen su curso.
    expect(STATUSES_THAT_CAN_REQUEST_KYB).not.toContain('VERIFICADO');
    expect(STATUSES_THAT_CAN_REQUEST_KYB).not.toContain('REVISION_MANUAL');
    expect(STATUSES_THAT_CAN_REQUEST_KYB).not.toContain('COMPLETED');
  });
});
