import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { type Transaction, type WhereOptions } from 'sequelize';
import { PinoLogger } from 'nestjs-pino';
import { createCrudRepository } from '../../../common/persistence/repositories/create-crud-repository';
import { PolicyRuleModel } from '../models';
import type { CreatePolicyRuleDto, ListPoliciesQueryDto } from '../ads.dtos';

@Injectable()
export class PoliciesRepository {
  private readonly baseRepository;

  constructor(
    @InjectModel(PolicyRuleModel) private readonly policyRuleModel: typeof PolicyRuleModel,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PoliciesRepository.name);
    this.baseRepository = createCrudRepository({ model: this.policyRuleModel, primaryKey: 'id' });
  }

  list(query: ListPoliciesQueryDto) {
    const where: WhereOptions = {};
    if (query.category) where.category = query.category;
    if (typeof query.isActive === 'boolean') where.is_active = query.isActive;
    if (query.severity) where.severity = query.severity;
    return this.baseRepository.paginate(where, query.page, query.limit, {
      order: [['created_at', 'DESC']],
    });
  }

  create(
    input: CreatePolicyRuleDto,
    actorId: string,
    transaction?: Transaction,
  ): Promise<PolicyRuleModel> {
    this.logger.info({ policyCode: input.policyCode }, 'Creating policy rule');
    return this.policyRuleModel.create(
      {
        policyCode: input.policyCode,
        category: input.category,
        ruleType: input.ruleType,
        severity: input.severity,
        description: input.description ?? `${input.category} - ${input.ruleType}`,
        isActive: input.isActive,
        createdBy: actorId,
        updatedBy: actorId,
      },
      { transaction },
    );
  }
}
