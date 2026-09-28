import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, WhereOptions } from 'sequelize';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import type {
  CreateActivityDto,
  ListActivitiesQueryDto,
  UpdateActivityDto,
} from '../b2b-sales-crm.dtos';
import { completedAtFor, initialActivityStatus } from '../domain/activity-status';
import type { ActivityStatus } from '../domain/activity-status';
import { CommercialActivityModel, InternalUserModel } from '../models/b2b-sales-crm.models';

/** Una fila de la tabla: la actividad y el NOMBRE de su responsable (no su identificador). */
export type ActivityRow = Record<string, unknown> & { ownerName: string | null };

export interface ActivityPage {
  items: ActivityRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function toRow(activity: CommercialActivityModel): ActivityRow {
  const { owner, ...rest } = activity.get({ plain: true }) as Record<string, unknown> & {
    owner?: { fullName?: string } | null;
  };
  return { ...rest, ownerName: owner?.fullName ?? null };
}

/** `%` y `_` del texto buscado son literales, no comodines. */
function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/**
 * Actividades comerciales: notas, llamadas, reuniones y tareas/recordatorios (con `dueAt`).
 * Alimenta la tabla de actividad de la cuenta/oportunidad y la lista de pendientes.
 *
 * Cada actividad tiene estado (PENDING / DONE / CANCELLED, ver `domain/activity-status.ts`);
 * `completedAt` se mantiene coherente con él y sólo lo escribe este servicio.
 */
@Injectable()
export class ActivitiesService {
  constructor(
    private readonly logger: PinoLoggerService,
    @InjectModel(CommercialActivityModel)
    private readonly activityModel: typeof CommercialActivityModel,
  ) {}

  create(input: CreateActivityDto): Promise<CommercialActivityModel> {
    this.logger.infoContext(ActivitiesService.name, 'Creando actividad comercial', {
      accountId: input.accountId,
      activityType: input.activityType,
    });
    const status = initialActivityStatus(input);
    return this.activityModel.create({
      accountId: input.accountId,
      opportunityId: input.opportunityId ?? null,
      ownerUserId: input.ownerUserId,
      activityType: input.activityType,
      subject: input.subject,
      description: input.description ?? null,
      dueAt: input.dueAt ?? null,
      status,
      completedAt: completedAtFor(status, null),
    });
  }

  /**
   * Paginado en el servidor, con búsqueda (asunto, detalle, responsable) y filtros por tipo y estado.
   * `pending=true` se conserva por compatibilidad: equivale a `status=PENDING` ordenado por
   * vencimiento.
   */
  async list(query: ListActivitiesQueryDto): Promise<ActivityPage> {
    const whereParts: WhereOptions[] = [];
    if (query.accountId) whereParts.push({ accountId: query.accountId });
    if (query.opportunityId) whereParts.push({ opportunityId: query.opportunityId });
    if (query.activityType) whereParts.push({ activityType: query.activityType });

    const onlyPending = query.pending === 'true';
    const status = query.status ?? (onlyPending ? 'PENDING' : undefined);
    if (status) whereParts.push({ status });

    if (query.search) {
      const pattern = likePattern(query.search);
      whereParts.push({
        [Op.or]: [
          { subject: { [Op.iLike]: pattern } },
          { description: { [Op.iLike]: pattern } },
          { '$owner.full_name$': { [Op.iLike]: pattern } },
        ],
      });
    }

    const { rows, count } = await this.activityModel.findAndCountAll({
      where: { [Op.and]: whereParts },
      include: [{ model: InternalUserModel, as: 'owner', attributes: ['id', 'fullName'] }],
      order: onlyPending
        ? [
            ['dueAt', 'ASC NULLS LAST'],
            ['createdAt', 'DESC'],
          ]
        : [
            ['createdAt', 'DESC'],
            ['id', 'DESC'],
          ],
      offset: (query.page - 1) * query.limit,
      limit: query.limit,
      distinct: true,
      subQuery: false,
    });

    return {
      items: rows.map(toRow),
      page: query.page,
      limit: query.limit,
      total: count,
      totalPages: Math.ceil(count / query.limit),
    };
  }

  async get(id: string): Promise<CommercialActivityModel> {
    const activity = await this.activityModel.findByPk(id);
    if (!activity) {
      throw new NotFoundException('Actividad comercial no encontrada.');
    }
    return activity;
  }

  async update(id: string, input: UpdateActivityDto): Promise<CommercialActivityModel> {
    const activity = await this.get(id);
    const { status: requested, completedAt, ...fields } = input;
    // `completedAt` suelto es la forma heredada de decir «hecha» (con fecha) o «pendiente» (null).
    const status: ActivityStatus | undefined =
      requested ?? (completedAt === undefined ? undefined : completedAt ? 'DONE' : 'PENDING');
    await activity.update({
      ...fields,
      ...(status
        ? {
            status,
            completedAt: completedAtFor(status, completedAt ?? activity.completedAt),
          }
        : {}),
    });
    return activity;
  }

  complete(id: string): Promise<CommercialActivityModel> {
    return this.setStatus(id, 'DONE');
  }

  /** Marca la actividad como pendiente, hecha o cancelada. */
  async setStatus(id: string, status: ActivityStatus): Promise<CommercialActivityModel> {
    const activity = await this.get(id);
    this.logger.infoContext(ActivitiesService.name, 'Cambiando estado de actividad comercial', {
      activityId: id,
      from: activity.status,
      to: status,
    });
    await activity.update({ status, completedAt: completedAtFor(status, activity.completedAt) });
    return activity;
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const activity = await this.get(id);
    await activity.destroy();
    return { deleted: true };
  }
}
