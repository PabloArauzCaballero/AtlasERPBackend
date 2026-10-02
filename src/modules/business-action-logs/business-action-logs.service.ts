import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, type WhereOptions } from 'sequelize';
import { BusinessActionLogModel } from '../../database/models';
import { PinoLoggerService } from '../../common/logging/pino-logger.service';
import type { BusinessActionLogQueryDto } from './business-action-logs.schemas';
import type { RecordBusinessActionLogInput } from './business-action-logs.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

@Injectable()
export class BusinessActionLogsService {
  constructor(
    @InjectModel(BusinessActionLogModel)
    private readonly businessActionLogModel: typeof BusinessActionLogModel,
    private readonly logger: PinoLoggerService,
  ) {}

  async record(input: RecordBusinessActionLogInput): Promise<BusinessActionLogModel> {
    /*
     * Hasta el 2026-09-18 esto miraba además si la petición venía de un formulario en papel y, en
     * ese caso, escribía `ERP_PAPER` con la serie del papel en `input_summary.paper`. Esa función
     * se retiró del producto entera; las filas que ya lo dicen se conservan —son historia, y por
     * eso `sourceSystem` sigue siendo texto libre y no un enum— pero ya nadie las escribe.
     */
    const sourceSystem = input.sourceSystem ?? 'ATLAS';
    /*
     * `actor_user_id` es un uuid (usuario INTERNO del ERP). Un usuario de comercio llega con su id
     * numérico de AtlasBackend («3»), y escribirlo ahí rompía el INSERT —y con él la transacción
     * entera—: el 2026-10-02 ningún comercio podía crear una sucursal desde su portal («Ocurrió un
     * error al consultar o modificar la base de datos»). El actor no se pierde: si no es un uuid
     * va en `input_summary.actorRef`, con su rol al lado en `actor_role`.
     */
    const actorEsInterno = UUID.test(input.actorUserId ?? '');
    const inputSummary =
      input.actorUserId && !actorEsInterno
        ? { ...(input.inputSummary ?? {}), actorRef: input.actorUserId }
        : (input.inputSummary ?? null);

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
        actorUserId: actorEsInterno ? input.actorUserId : null,
        actorRole: input.actorRole ?? null,
        aggregateType: input.aggregateType ?? null,
        aggregateId: input.aggregateId ?? null,
        correlationId: input.correlationId ?? null,
        requestId: input.requestId ?? null,
        sourceSystem,
        affectedTables: input.affectedTables,
        affectedRecordCount: input.affectedRecordCount,
        status: input.status,
        inputSummary,
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
    if (query.sourceSystem) where.sourceSystem = query.sourceSystem;
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
