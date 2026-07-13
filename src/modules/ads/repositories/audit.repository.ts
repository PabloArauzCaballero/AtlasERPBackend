import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, type Transaction, type WhereOptions } from 'sequelize';
import { PinoLogger } from 'nestjs-pino';
import { createCrudRepository } from '../../../common/persistence/repositories/create-crud-repository';
import { AuditLogModel } from '../models';
import type { AuditQueryDto } from '../ads.dtos';

@Injectable()
export class AuditRepository {
  private readonly baseRepository;

  constructor(
    @InjectModel(AuditLogModel) private readonly auditLogModel: typeof AuditLogModel,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuditRepository.name);
    this.baseRepository = createCrudRepository({ model: this.auditLogModel, primaryKey: 'id' });
  }

  create(values: Partial<AuditLogModel>, transaction?: Transaction): Promise<AuditLogModel> {
    this.logger.debug(
      { entityType: values.entityType, entityId: values.entityId },
      'Creating audit entry',
    );
    return this.auditLogModel.create(values, { transaction });
  }

  list(query: AuditQueryDto) {
    const where: WhereOptions = {};
    if (query.entityType) where.entity_type = query.entityType;
    if (query.entityId) where.entity_id = query.entityId;
    if (query.actorId) where.actor_user_id = query.actorId;
    if (query.severity) where.severity = query.severity;
    if (query.from || query.to) {
      where.created_at = {
        ...(query.from ? { [Op.gte]: new Date(`${query.from}T00:00:00.000Z`) } : {}),
        ...(query.to ? { [Op.lte]: new Date(`${query.to}T23:59:59.999Z`) } : {}),
      };
    }
    return this.baseRepository.paginate(where, query.page, query.limit, {
      order: [['created_at', 'DESC']],
    });
  }
}
