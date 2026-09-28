import { ACTIVITY_STATUSES, completedAtFor, initialActivityStatus } from './activity-status';

describe('Estado de la actividad comercial', () => {
  it('tiene exactamente tres estados, los mismos que el CHECK de la migración', () => {
    expect(ACTIVITY_STATUSES).toEqual(['PENDING', 'DONE', 'CANCELLED']);
  });

  it('una tarea nace pendiente, con o sin vencimiento', () => {
    expect(initialActivityStatus({ activityType: 'TASK' })).toBe('PENDING');
    expect(initialActivityStatus({ activityType: 'TASK', dueAt: new Date() })).toBe('PENDING');
  });

  it('una reunión agendada (con vencimiento) nace pendiente', () => {
    expect(initialActivityStatus({ activityType: 'MEETING', dueAt: new Date() })).toBe('PENDING');
  });

  it('una nota o llamada registrada sin vencimiento es el acta de algo que ya pasó: hecha', () => {
    expect(initialActivityStatus({ activityType: 'NOTE' })).toBe('DONE');
    expect(initialActivityStatus({ activityType: 'CALL', dueAt: null })).toBe('DONE');
  });

  it('si quien la registra dice el estado, manda lo que dice', () => {
    expect(initialActivityStatus({ activityType: 'TASK', status: 'DONE' })).toBe('DONE');
    expect(initialActivityStatus({ activityType: 'NOTE', status: 'PENDING' })).toBe('PENDING');
  });

  it('completedAt sólo existe en HECHA y conserva la fecha original', () => {
    const now = new Date('2026-09-28T12:00:00Z');
    const before = new Date('2026-09-20T12:00:00Z');
    expect(completedAtFor('DONE', null, now)).toEqual(now);
    expect(completedAtFor('DONE', before, now)).toEqual(before);
    expect(completedAtFor('PENDING', before, now)).toBeNull();
    expect(completedAtFor('CANCELLED', before, now)).toBeNull();
  });
});
