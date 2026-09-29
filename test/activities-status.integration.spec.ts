/**
 * La tabla «Actividad y tareas» de la cuenta B2B contra PostgreSQL REAL y recién migrado.
 *
 * Lo que la prueba unitaria no puede ver: que la búsqueda por el NOMBRE del responsable
 * (`$owner.full_name$`) y el orden `NULLS LAST` son SQL válido, que la paginación cuenta bien con la
 * inclusión, y que el CHECK `ck_commercial_activities_status` de la migración acepta los tres
 * estados del dominio y rechaza cualquier otro. Datos sintéticos.
 */
import { randomUUID } from 'node:crypto';
import { SequelizeModule, getConnectionToken } from '@nestjs/sequelize';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { PinoLoggerService } from '../src/common/logging/pino-logger.service';
import { listActivitiesQuerySchema } from '../src/modules/b2b-sales-crm/b2b-sales-crm.schemas';
import {
  CommercialActivityModel,
  atlasSalesModels,
} from '../src/modules/b2b-sales-crm/models/b2b-sales-crm.models';
import { ActivitiesService } from '../src/modules/b2b-sales-crm/services/activities.service';
import { createMigratedDatabase, describeWithDatabase } from './support/coverage-integration-db';
import type { MigratedDatabase } from './support/coverage-integration-db';

const silentLogger = {
  infoContext: () => undefined,
  debugContext: () => undefined,
  warnContext: () => undefined,
  errorContext: () => undefined,
};

describeWithDatabase('Actividades comerciales con estado (PostgreSQL real)', () => {
  let db: MigratedDatabase;
  let moduleRef: TestingModule;
  let sequelize: Sequelize;
  let service: ActivitiesService;
  let accountId: string;
  let ownerId: string;

  async function insertId(sql: string, bind: unknown[]): Promise<string> {
    const rows = await sequelize.query<{ id: string }>(`${sql} RETURNING id`, {
      bind,
      type: QueryTypes.SELECT,
    });
    return rows[0]!.id;
  }

  beforeAll(async () => {
    db = await createMigratedDatabase('act');
    moduleRef = await Test.createTestingModule({
      imports: [
        SequelizeModule.forRoot({
          dialect: 'postgres',
          uri: db.url,
          dialectOptions: { options: '-c search_path=atlas_sales,atlas_accounting,public' },
          autoLoadModels: false,
          synchronize: false,
          models: [...atlasSalesModels],
          logging: false,
        }),
        SequelizeModule.forFeature([CommercialActivityModel]),
      ],
      providers: [ActivitiesService, { provide: PinoLoggerService, useValue: silentLogger }],
    }).compile();
    sequelize = moduleRef.get<Sequelize>(getConnectionToken());
    service = moduleRef.get(ActivitiesService);

    const tag = randomUUID().slice(0, 8);
    accountId = await insertId(
      `INSERT INTO atlas_sales.b2b_accounts (legal_name, trade_name, tax_id, lifecycle_status, category, business_line)
       VALUES ($1, $1, $2, 'CUSTOMER', 'PRUEBA', 'PRUEBA')`,
      [`Comercio sintético ${tag}`, `9${Date.now()}`.slice(0, 12)],
    );
    ownerId = await insertId(
      `INSERT INTO atlas_sales.internal_users (full_name, email, role_code) VALUES ($1, $2, 'COMMERCIAL_EXECUTIVE')`,
      ['Rocío Sintética', `rocio-${tag}@atlas.test`],
    );

    const base = { accountId, ownerUserId: ownerId };
    await service.create({ ...base, activityType: 'NOTE', subject: 'Nota de la visita' });
    await service.create({ ...base, activityType: 'TASK', subject: 'Enviar propuesta 50%' });
    await service.create({
      ...base,
      activityType: 'MEETING',
      subject: 'Reunión con gerencia',
      dueAt: new Date('2026-10-02T15:00:00Z'),
    });
    for (let i = 0; i < 4; i += 1) {
      await service.create({ ...base, activityType: 'CALL', subject: `Llamada ${i}` });
    }
  }, 120000);

  afterAll(async () => {
    await moduleRef?.close();
    await db?.drop();
  });

  const query = (input: Record<string, unknown>) =>
    listActivitiesQuerySchema.parse({ accountId, ...input });

  it('pagina en el servidor con el total real y el nombre del responsable', async () => {
    const first = await service.list(query({ limit: '5' }));
    expect(first.total).toBe(7);
    expect(first.totalPages).toBe(2);
    expect(first.items).toHaveLength(5);
    expect(first.items[0]!.ownerName).toBe('Rocío Sintética');
    const second = await service.list(query({ limit: '5', page: '2' }));
    expect(second.items).toHaveLength(2);
  });

  it('el estado inicial sale del dominio: tarea y agendada pendientes; lo registrado, hecho', async () => {
    const pending = await service.list(query({ status: 'PENDING' }));
    expect(pending.items.map((row) => row.subject).sort()).toEqual([
      'Enviar propuesta 50%',
      'Reunión con gerencia',
    ]);
    const done = await service.list(query({ status: 'DONE' }));
    expect(done.total).toBe(5);
  });

  it('busca por asunto (con % literal) y por nombre del responsable', async () => {
    expect((await service.list(query({ search: '50%' }))).total).toBe(1);
    expect((await service.list(query({ search: 'rocío' }))).total).toBe(7);
    expect((await service.list(query({ search: 'nada así' }))).total).toBe(0);
  });

  it('filtra por tipo y ordena pendientes por vencimiento con pending=true', async () => {
    expect((await service.list(query({ activityType: 'CALL' }))).total).toBe(4);
    const legacy = await service.list(query({ pending: 'true' }));
    expect(legacy.items.map((row) => row.subject)).toEqual([
      'Reunión con gerencia',
      'Enviar propuesta 50%',
    ]);
  });

  it('cancelar y reabrir pasan por el CHECK y mantienen completed_at coherente', async () => {
    const [task] = (await service.list(query({ activityType: 'TASK' }))).items;
    const id = String(task!.id);
    const cancelled = await service.update(id, { status: 'CANCELLED' });
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.completedAt).toBeNull();
    const done = await service.update(id, { status: 'DONE' });
    expect(done.completedAt).toBeInstanceOf(Date);
    const reopened = await service.update(id, { status: 'PENDING' });
    expect(reopened.completedAt).toBeNull();
  });

  it('la base rechaza una actividad DONE sin fecha de cierre (ck_commercial_activities_done_has_completed_at)', async () => {
    await expect(
      sequelize.query(
        `UPDATE atlas_sales.commercial_activities SET status = 'DONE', completed_at = NULL WHERE account_id = $1`,
        { bind: [accountId] },
      ),
    ).rejects.toThrow(/ck_commercial_activities_done_has_completed_at/);
  });

  it('PENDING y CANCELLED sí pueden ir sin fecha de cierre', async () => {
    for (const status of ['PENDING', 'CANCELLED']) {
      await expect(
        sequelize.query(
          `UPDATE atlas_sales.commercial_activities SET status = $2, completed_at = NULL WHERE account_id = $1`,
          { bind: [accountId, status] },
        ),
      ).resolves.toBeDefined();
    }
  });

  it('la base rechaza un estado fuera del dominio', async () => {
    await expect(
      sequelize.query(
        `UPDATE atlas_sales.commercial_activities SET status = 'ARCHIVADA' WHERE account_id = $1`,
        { bind: [accountId] },
      ),
    ).rejects.toThrow(/ck_commercial_activities_status/);
  });
});
