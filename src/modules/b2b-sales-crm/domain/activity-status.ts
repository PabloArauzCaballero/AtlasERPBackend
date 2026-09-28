/**
 * Estado de una actividad comercial: PENDIENTE, HECHA o CANCELADA.
 *
 * Antes no había estado: una actividad era «tarea» si tenía `dueAt` y estaba «completada» si tenía
 * `completedAt`. No había forma de decir que una tarea ya no se iba a hacer —había que borrarla, y
 * con ella su historia—, y una llamada registrada sin fecha no era ni pendiente ni hecha.
 *
 * `completedAt` se conserva y se mantiene coherente con el estado: es CUÁNDO se marcó como hecha
 * (la lista de pendientes y el endpoint `/complete` lo siguen usando). Sólo lo escribe este módulo.
 */
export const ACTIVITY_STATUSES = ['PENDING', 'DONE', 'CANCELLED'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

/**
 * El estado con el que nace una actividad cuando quien la registra no lo dice.
 *
 * - Una TAREA nace PENDIENTE: es algo por hacer.
 * - Cualquier actividad con vencimiento (una reunión agendada para el jueves) nace PENDIENTE:
 *   todavía no ha pasado.
 * - Una nota, llamada, reunión, correo… registrada SIN vencimiento es el acta de algo que ya
 *   ocurrió: nace HECHA. Dejarla pendiente llenaría la lista de pendientes con cosas que nadie
 *   tiene que hacer.
 */
export function initialActivityStatus(input: {
  activityType: string;
  dueAt?: Date | null | undefined;
  status?: ActivityStatus | undefined;
}): ActivityStatus {
  if (input.status) return input.status;
  if (input.activityType === 'TASK') return 'PENDING';
  if (input.dueAt) return 'PENDING';
  return 'DONE';
}

/**
 * `completedAt` que corresponde a un estado: la fecha en que pasó a HECHA (se conserva si ya lo
 * estaba) y nada en cualquier otro estado.
 */
export function completedAtFor(
  status: ActivityStatus,
  previousCompletedAt: Date | null | undefined,
  now: Date = new Date(),
): Date | null {
  if (status !== 'DONE') return null;
  return previousCompletedAt ?? now;
}
