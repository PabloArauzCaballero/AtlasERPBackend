/**
 * El ciclo de vida de un caso de onboarding, y qué significa «estar en la cola».
 *
 * Antes sólo había un listado: `findAll` sin filtro, y la pantalla pintaba los comercios ya
 * activados en la misma tabla que los que faltaban por atender. Un caso `COMPLETED` es el
 * expediente de por qué se habilitó un comercio —no se borra—, pero no es TRABAJO pendiente, y
 * mezclarlo con el trabajo pendiente hace que la cola no se pueda leer.
 *
 * Los estados son la posición del caso en la cadena ERP → Motor → Portal → ERP:
 *
 *   OPEN            datos capturados, aún no se pidió nada
 *   EN_VERIFICACION pedido al Motor, esperando desenlace
 *   REVISION_MANUAL el Motor abrió caso; lo mira una persona
 *   RECHAZADO       el Motor rechazó; falta un requisito duro y hay que corregirlo
 *   VERIFICADO      aprobado por el Motor; falta la identidad
 *   ALTA_PENDIENTE  credenciales pedidas al portal
 *   LISTO           credenciales concedidas y acusadas: es lo que toca activar
 *   COMPLETED       comercio activado y operando — sale de la cola
 *
 * `IN_PROGRESS` y `BLOCKED` son los valores heredados de las filas anteriores a este cambio. Se
 * conservan como sinónimos (abierto y a revisión) en vez de migrarlos: reescribir el historial
 * para que encaje con un vocabulario nuevo es exactamente lo que un expediente no debe permitir.
 */
export const ONBOARDING_CASE_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'BLOCKED',
  'EN_VERIFICACION',
  'REVISION_MANUAL',
  'RECHAZADO',
  'VERIFICADO',
  'ALTA_PENDIENTE',
  'LISTO',
  'COMPLETED',
] as const;

export type OnboardingCaseStatus = (typeof ONBOARDING_CASE_STATUSES)[number];

/** El único estado que saca un caso de la cola. */
export const ONBOARDING_TERMINAL_STATUS: OnboardingCaseStatus = 'COMPLETED';

export const ONBOARDING_OPEN_STATUSES: readonly OnboardingCaseStatus[] =
  ONBOARDING_CASE_STATUSES.filter((status) => status !== ONBOARDING_TERMINAL_STATUS);

/**
 * `abiertos` es el defecto de la pantalla; `historial` son los ya activados; `todos` existe para
 * exportar y auditar, no para trabajar.
 */
export const ONBOARDING_SCOPES = ['abiertos', 'historial', 'todos'] as const;
export type OnboardingScope = (typeof ONBOARDING_SCOPES)[number];

export function statusesForScope(scope: OnboardingScope): readonly OnboardingCaseStatus[] {
  if (scope === 'abiertos') return ONBOARDING_OPEN_STATUSES;
  if (scope === 'historial') return [ONBOARDING_TERMINAL_STATUS];
  return ONBOARDING_CASE_STATUSES;
}

export interface OnboardingCaseSnapshot {
  status: string;
  pendingItems: number;
  hasActiveContract: boolean;
}

/**
 * Las cinco cifras del mini-tablero, todas contadas sobre las mismas filas y con la misma regla
 * que aplica la activación: «listo para activar» es exactamente lo que `activateOnboardingCase`
 * aceptaría hoy, no una aproximación optimista.
 */
export interface OnboardingQueueSummary {
  abiertos: number;
  esperandoMotor: number;
  revisionManual: number;
  esperandoCredenciales: number;
  listosParaActivar: number;
  activados: number;
}

export function summarizeOnboardingQueue(rows: readonly OnboardingCaseSnapshot[]): OnboardingQueueSummary {
  const summary: OnboardingQueueSummary = {
    abiertos: 0,
    esperandoMotor: 0,
    revisionManual: 0,
    esperandoCredenciales: 0,
    listosParaActivar: 0,
    activados: 0,
  };

  for (const row of rows) {
    if (row.status === ONBOARDING_TERMINAL_STATUS) {
      summary.activados += 1;
      continue;
    }
    summary.abiertos += 1;
    if (row.status === 'EN_VERIFICACION') summary.esperandoMotor += 1;
    if (row.status === 'REVISION_MANUAL' || row.status === 'BLOCKED') summary.revisionManual += 1;
    if (row.status === 'ALTA_PENDIENTE') summary.esperandoCredenciales += 1;
    if (isReadyToActivate(row)) summary.listosParaActivar += 1;
  }

  return summary;
}

/**
 * Lo que la activación comprueba de verdad: sin requisitos pendientes y con contrato vigente.
 * Cuando la verificación del Motor sea obligatoria (compuerta dura) se añadirá aquí, y la cifra
 * del tablero cambiará con ella, que es la gracia de contar con la misma regla.
 */
export function isReadyToActivate(row: OnboardingCaseSnapshot): boolean {
  return row.status !== ONBOARDING_TERMINAL_STATUS && row.pendingItems === 0 && row.hasActiveContract;
}
