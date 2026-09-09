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

/** Lo que publica el Motor al decidir el KYB, tal cual: no se interpreta aquí. */
export const KYB_OUTCOMES = ['APROBADO', 'RECHAZADO', 'REVISION_MANUAL'] as const;
export type KybOutcome = (typeof KYB_OUTCOMES)[number];

/** A qué estado del caso lleva cada desenlace del Motor. */
export const STATUS_FOR_KYB_OUTCOME: Record<KybOutcome, OnboardingCaseStatus> = {
  APROBADO: 'VERIFICADO',
  RECHAZADO: 'RECHAZADO',
  REVISION_MANUAL: 'REVISION_MANUAL',
};

/** Desde qué estados se puede (volver a) pedir la verificación. */
export const STATUSES_THAT_CAN_REQUEST_KYB: readonly OnboardingCaseStatus[] = [
  'OPEN',
  'IN_PROGRESS',
  'BLOCKED',
  'RECHAZADO',
];

export interface OnboardingCaseSnapshot {
  status: string;
  pendingItems: number;
  hasActiveContract: boolean;
  /** `decision_outcome === 'APROBADO'`: la compuerta dura. */
  motorApproved: boolean;
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
 * Lo que la activación comprueba de verdad: sin requisitos pendientes, con contrato vigente y con
 * el KYB APROBADO por el Motor. La tercera es la compuerta dura: sin desenlace del Motor no se
 * activa a nadie, y se corta en el servicio, no en la pantalla, porque una pantalla se salta con
 * `curl`. Contar aquí con la misma regla es lo que hace que «listos» en el tablero sea verdad.
 */
export function isReadyToActivate(row: OnboardingCaseSnapshot): boolean {
  return (
    row.status !== ONBOARDING_TERMINAL_STATUS &&
    row.pendingItems === 0 &&
    row.hasActiveContract &&
    row.motorApproved
  );
}

/**
 * En qué quedaron las credenciales pedidas para un comercio, contadas sobre sus usuarios del CRM.
 *
 * `pendientes` son los INVITED con petición encolada: los que todavía hay que ir a preguntar.
 * `concedidas` son los que ya tienen identidad detrás (`userId`). `rechazadas` quedan DISABLED
 * con la petición puesta: no se borran, porque el rechazo trae motivo y hay que poder leerlo.
 */
export interface CredentialsSnapshot {
  status: string;
  identityRequestId: string | null;
  userId: string | null;
  rejectionReason?: string | null | undefined;
}

export interface CredentialsSummary {
  pedidas: number;
  pendientes: number;
  concedidas: number;
  rechazadas: number;
  /** Los motivos de rechazo, sin repetir: la fila los enseña sin volver a preguntar. */
  motivosRechazo: string[];
}

export function summarizeCredentials(users: readonly CredentialsSnapshot[]): CredentialsSummary {
  const summary: CredentialsSummary = { pedidas: 0, pendientes: 0, concedidas: 0, rechazadas: 0, motivosRechazo: [] };
  for (const user of users) {
    if (!user.identityRequestId) continue;
    summary.pedidas += 1;
    if (user.userId) summary.concedidas += 1;
    else if (user.status === 'INVITED') summary.pendientes += 1;
    else if (user.status === 'DISABLED') {
      summary.rechazadas += 1;
      const motivo = user.rejectionReason?.trim();
      if (motivo && !summary.motivosRechazo.includes(motivo)) summary.motivosRechazo.push(motivo);
    }
  }
  return summary;
}

/** El texto de la fila. Una frase, no cuatro cifras: es lo que responde «¿ya pueden entrar?». */
export function describeCredentials(summary: CredentialsSummary): string {
  if (summary.pedidas === 0) return 'Sin pedir';
  const partes: string[] = [];
  if (summary.concedidas) partes.push(`${summary.concedidas} concedida${summary.concedidas === 1 ? '' : 's'}`);
  if (summary.pendientes) partes.push(`${summary.pendientes} pendiente${summary.pendientes === 1 ? '' : 's'}`);
  if (summary.rechazadas) {
    const motivo = summary.motivosRechazo.length ? ` (${summary.motivosRechazo.join('; ')})` : '';
    partes.push(`${summary.rechazadas} rechazada${summary.rechazadas === 1 ? '' : 's'}${motivo}`);
  }
  return partes.join(' · ');
}
