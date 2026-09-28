import { Op } from 'sequelize';
import { listActivitiesQuerySchema } from '../b2b-sales-crm.schemas';
import { ActivitiesService } from './activities.service';

/**
 * La tabla «Actividad y tareas» de la ficha de la cuenta, con el modelo fingido: lo que importa es
 * qué pide a la base (filtros, página, orden) y que el estado y `completedAt` no se contradigan.
 */
const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';

function fakeActivity(values: Record<string, unknown>) {
  const row: Record<string, unknown> & {
    update: jest.Mock;
    get: jest.Mock;
  } = {
    ...values,
    update: jest.fn(async (patch: Record<string, unknown>) => Object.assign(row, patch)),
    get: jest.fn(() => ({ ...values, owner: { fullName: 'Ana Pérez' } })),
  };
  return row;
}

function build(found?: ReturnType<typeof fakeActivity>) {
  const model = {
    create: jest.fn(async (values: Record<string, unknown>) => values),
    findAndCountAll: jest.fn().mockResolvedValue({
      rows: [fakeActivity({ id: 'a1', subject: 'Llamar' })],
      count: 31,
    }),
    findByPk: jest.fn().mockResolvedValue(found ?? null),
  };
  const logger = { infoContext: jest.fn() };
  const service = new ActivitiesService(logger as never, model as never);
  return { service, model };
}

const query = (input: Record<string, unknown>) => listActivitiesQuerySchema.parse(input);

describe('ActivitiesService', () => {
  it('pagina en el servidor y devuelve el nombre del responsable, no su identificador', async () => {
    const { service, model } = build();
    const page = await service.list(query({ accountId: ACCOUNT, page: '2', limit: '10' }));

    const args = model.findAndCountAll.mock.calls[0][0];
    expect(args.offset).toBe(10);
    expect(args.limit).toBe(10);
    expect(page).toMatchObject({ page: 2, limit: 10, total: 31, totalPages: 4 });
    expect(page.items[0]).toMatchObject({ id: 'a1', ownerName: 'Ana Pérez' });
    expect(page.items[0]).not.toHaveProperty('owner');
  });

  it('filtra por tipo y estado, y busca en asunto, detalle y responsable', async () => {
    const { service, model } = build();
    await service.list(
      query({ accountId: ACCOUNT, activityType: 'CALL', status: 'CANCELLED', search: '50%' }),
    );
    const parts = model.findAndCountAll.mock.calls[0][0].where[Op.and];
    expect(parts).toEqual(
      expect.arrayContaining([
        { accountId: ACCOUNT },
        { activityType: 'CALL' },
        { status: 'CANCELLED' },
      ]),
    );
    const search = parts.find((part: Record<symbol, unknown>) => part[Op.or]);
    // El `%` del texto buscado es literal, no un comodín.
    expect(search[Op.or][0].subject[Op.iLike]).toBe('%50\\%%');
    expect(search[Op.or]).toHaveLength(3);
  });

  it('pending=true (heredado) equivale a status=PENDING ordenado por vencimiento', async () => {
    const { service, model } = build();
    await service.list(query({ accountId: ACCOUNT, pending: 'true' }));
    const args = model.findAndCountAll.mock.calls[0][0];
    expect(args.where[Op.and]).toEqual(expect.arrayContaining([{ status: 'PENDING' }]));
    expect(args.order[0]).toEqual(['dueAt', 'ASC NULLS LAST']);
  });

  it('una nota sin vencimiento nace hecha y una tarea nace pendiente', async () => {
    const { service, model } = build();
    const base = { accountId: ACCOUNT, ownerUserId: OWNER, subject: 'x' };
    await service.create({ ...base, activityType: 'NOTE' });
    await service.create({ ...base, activityType: 'TASK' });
    const [nota, tarea] = model.create.mock.calls.map((call) => call[0]) as Array<
      Record<string, unknown>
    >;
    expect(nota?.status).toBe('DONE');
    expect(nota?.completedAt).toBeInstanceOf(Date);
    expect(tarea?.status).toBe('PENDING');
    expect(tarea?.completedAt).toBeNull();
  });

  it('cancelar borra completedAt; volver a hecha lo pone', async () => {
    const hecha = fakeActivity({ id: 'a1', status: 'DONE', completedAt: new Date('2026-09-01') });
    const { service } = build(hecha);
    await service.update('a1', { status: 'CANCELLED' });
    expect(hecha.status).toBe('CANCELLED');
    expect(hecha.completedAt).toBeNull();
    await service.update('a1', { status: 'DONE' });
    expect(hecha.status).toBe('DONE');
    expect(hecha.completedAt).toBeInstanceOf(Date);
  });

  it('completedAt suelto (forma heredada) mueve también el estado', async () => {
    const tarea = fakeActivity({ id: 'a1', status: 'PENDING', completedAt: null });
    const { service } = build(tarea);
    await service.update('a1', { completedAt: new Date('2026-09-02') });
    expect(tarea.status).toBe('DONE');
    await service.update('a1', { completedAt: null });
    expect(tarea.status).toBe('PENDING');
    expect(tarea.completedAt).toBeNull();
  });

  it('editar el asunto no toca el estado', async () => {
    const tarea = fakeActivity({ id: 'a1', status: 'PENDING', completedAt: null });
    const { service } = build(tarea);
    await service.update('a1', { subject: 'Otro' });
    expect(tarea.update).toHaveBeenCalledWith({ subject: 'Otro' });
  });

  it('complete() es marcar como hecha', async () => {
    const tarea = fakeActivity({ id: 'a1', status: 'PENDING', completedAt: null });
    const { service } = build(tarea);
    await service.complete('a1');
    expect(tarea.status).toBe('DONE');
  });
});
