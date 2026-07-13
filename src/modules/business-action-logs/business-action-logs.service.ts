import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, type WhereOptions } from 'sequelize';
import { BusinessActionLogModel } from '../../database/models';
import { PinoLoggerService } from '../../common/logging/pino-logger.service';
import type { BusinessActionLogQueryDto } from './business-action-logs.schemas';
import type { RecordBusinessActionLogInput } from './business-action-logs.types';

@Injectable()
export class BusinessActionLogsService {
  constructor(
    @InjectModel(BusinessActionLogModel)
    private readonly businessActionLogModel: typeof BusinessActionLogModel,
    private readonly logger: PinoLoggerService,
  ) {}

  async record(input: RecordBusinessActionLogInput): Promise<BusinessActionLogModel> {
    this.logger.infoContext(BusinessActionLogsService.name, 'Recording business action log', {
      moduleCode: input.moduleCode,
      businessProcess: input.businessProcess,
      actionCode: input.actionCode,
      aggregateType: input.aggregateType ?? null,
      aggregateId: input.aggregateId ?? null,
      correlationId: input.correlationId ?? null,
      affectedRecordCount: input.affectedRecordCount,
      status: input.status,
    });

    return this.businessActionLogModel.create(
      {
        moduleCode: input.moduleCode,
        businessProcess: input.businessProcess,
        actionCode: input.actionCode,
        actorUserId: input.actorUserId ?? null,
        actorRole: input.actorRole ?? null,
        aggregateType: input.aggregateType ?? null,
        aggregateId: input.aggregateId ?? null,
        correlationId: input.correlationId ?? null,
        requestId: input.requestId ?? null,
        sourceSystem: input.sourceSystem ?? 'ATLAS',
        affectedTables: input.affectedTables,
        affectedRecordCount: input.affectedRecordCount,
        status: input.status,
        inputSummary: input.inputSummary ?? null,
        outputSummary: input.outputSummary ?? null,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
      },
      { transaction: input.transaction },
    );
  }

  async list(query: BusinessActionLogQueryDto): Promise<Record<string, unknown>> {
    const where: WhereOptions = {};
    if (query.moduleCode) where.moduleCode = query.moduleCode;
    if (query.businessProcess) where.businessProcess = query.businessProcess;
    if (query.actionCode) where.actionCode = query.actionCode;
    if (query.status) where.status = query.status;
    if (query.aggregateType) where.aggregateType = query.aggregateType;
    if (query.aggregateId) where.aggregateId = query.aggregateId;
    if (query.actorUserId) where.actorUserId = query.actorUserId;
    if (query.correlationId) where.correlationId = query.correlationId;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { [Op.gte]: new Date(`${query.from}T00:00:00.000Z`) } : {}),
        ...(query.to ? { [Op.lte]: new Date(`${query.to}T23:59:59.999Z`) } : {}),
      };
    }

    const offset = (query.page - 1) * query.pageSize;
    const result = await this.businessActionLogModel.findAndCountAll({
      where,
      offset,
      limit: query.pageSize,
      order: [['createdAt', 'DESC']],
    });

    return {
      items: result.rows.map((row) => row.get({ plain: true })),
      page: query.page,
      pageSize: query.pageSize,
      total: result.count,
      totalPages: Math.ceil(result.count / query.pageSize),
    };
  }
}
