import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, Transaction } from 'sequelize';
import { PostingRuleVersionModel } from '../../../../database/models';
import { CreateAccountingDocumentDto } from '../../shared/schemas/accounting.schemas';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

/**
 * Resuelve la regla de contabilización vigente para dejar trazabilidad de política aplicada.
 *
 * No intenta ser un motor SAP completo. Para este módulo, el objetivo mínimo de producción es
 * congelar qué regla estaba activa cuando se creó el documento. Así se evita perder trazabilidad
 * ante cambios futuros de criterios contables o fiscales.
 */
@Injectable()
export class PostingRuleSnapshotService {
  constructor(
    private readonly logger: PinoLoggerService,
    @InjectModel(PostingRuleVersionModel)
    private readonly postingRuleVersionModel: typeof PostingRuleVersionModel,
  ) {}

  async findApplicableRuleId(
    input: CreateAccountingDocumentDto,
    transaction: Transaction,
  ): Promise<string | null> {
    this.logger.debug('Buscando regla de contabilización vigente.', {
      layer: 'service',
      module: 'accounting-documents',
      service: 'PostingRuleSnapshotService',
      action: 'findApplicableRuleId',
      sourceSystem: input.sourceSystem,
      sourceType: input.sourceType,
      documentType: input.documentType,
    });
    const postingDate =
      input.postingDate instanceof Date ? input.postingDate : new Date(input.postingDate);
    const ruleCodes = [
      `${input.sourceSystem}.${input.sourceType}.${input.documentType}`,
      `${input.sourceSystem}.${input.sourceType}`,
      input.sourceType,
    ];

    const rule = await this.postingRuleVersionModel.findOne({
      where: {
        status: 'ACTIVE',
        ruleCode: { [Op.in]: ruleCodes },
        effectiveFrom: { [Op.lte]: postingDate },
        [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: postingDate } }],
      },
      order: [
        ['versionNo', 'DESC'],
        ['effectiveFrom', 'DESC'],
      ],
      transaction,
    });

    this.logger.debug('Regla de contabilización resuelta.', {
      layer: 'service',
      module: 'accounting-documents',
      service: 'PostingRuleSnapshotService',
      action: 'findApplicableRuleId',
      ruleId: rule?.id ?? null,
    });
    return rule?.id ?? null;
  }
}
