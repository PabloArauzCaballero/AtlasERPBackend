import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, WhereOptions } from 'sequelize';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import type {
  CreateActivityDto,
  ListActivitiesQueryDto,
  UpdateActivityDto,
} from '../b2b-sales-crm.dtos';
import { CommercialActivityModel } from '../models/b2b-sales-crm.models';

/**
 * Actividades comerciales: notas, llamadas, reuniones y tareas/recordatorios (con `dueAt`).
 * Alimenta el timeline de la cuenta/oportunidad y la lista de pendientes.
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
    return this.activityModel.create({
      accountId: input.accountId,
      opportunityId: input.opportunityId ?? null,
      ownerUserId: input.ownerUserId,
      activityType: input.activityType,
      subject: input.subject,
      description: input.description ?? null,
      dueAt: input.dueAt ?? null,
    });
  }

  list(query: ListActivitiesQueryDto): Promise<CommercialActivityModel[]> {
    const where: Record<string | symbol, unknown> = {};
    if (query.accountId) where.accountId = query.accountId;
    if (query.opportunityId) where.opportunityId = query.opportunityId;
    if (query.activityType) where.activityType = query.activityType;

    const onlyPending = query.pending === 'true';
    if (onlyPending) {
      where.dueAt = { [Op.ne]: null };
      where.completedAt = { [Op.is]: null };
    }

    return this.activityModel.findAll({
      where: where as WhereOptions,
      order: onlyPending ? [['dueAt', 'ASC']] : [['createdAt', 'DESC']],
    });
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
    await activity.update(input);
    return activity;
  }

  async complete(id: string): Promise<CommercialActivityModel> {
    const activity = await this.get(id);
    await activity.update({ completedAt: new Date() });
    return activity;
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const activity = await this.get(id);
    await activity.destroy();
    return { deleted: true };
  }
}
