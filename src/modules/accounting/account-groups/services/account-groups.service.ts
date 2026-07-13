import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { WhereOptions } from 'sequelize';
import {
  GlAccountEntityLinkModel,
  GlAccountGroupModel,
  GlAccountModel,
  JournalEntryEntityLinkModel,
} from '../../../../database/models';
import {
  CreateEntityLinkDto,
  CreateGlAccountGroupDto,
  ListGlAccountGroupsQueryDto,
  UpdateGlAccountGroupDto,
} from '../../shared/schemas/accounting.schemas';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

export interface GroupTreeNode {
  id: string;
  code: string;
  name: string;
  statementType: string;
  classification: string;
  subClassification: string | null;
  sortOrder: number;
  status: string;
  children: GroupTreeNode[];
}

/**
 * Grupos de cuenta (árbol de reporte: Balance General > Activo > Corriente > subgrupo)
 * y vínculos multientidad entre cuentas GL / asientos y cualquier otra entidad.
 */
@Injectable()
export class AccountGroupsService {
  constructor(
    private readonly logger: PinoLoggerService,
    @InjectModel(GlAccountGroupModel)
    private readonly groupModel: typeof GlAccountGroupModel,
    @InjectModel(GlAccountModel) private readonly glAccountModel: typeof GlAccountModel,
    @InjectModel(GlAccountEntityLinkModel)
    private readonly accountLinkModel: typeof GlAccountEntityLinkModel,
    @InjectModel(JournalEntryEntityLinkModel)
    private readonly journalLinkModel: typeof JournalEntryEntityLinkModel,
  ) {}

  async createGroup(input: CreateGlAccountGroupDto): Promise<GlAccountGroupModel> {
    this.logger.info('Creando grupo de cuenta.', {
      layer: 'service',
      module: 'account-groups',
      action: 'createGroup',
      coaId: input.coaId,
      code: input.code,
    });
    if (input.parentGroupId) {
      const parent = await this.getGroup(input.parentGroupId);
      if (parent.coaId !== input.coaId) {
        throw new BadRequestException({
          code: 'ACCOUNT_GROUP_PARENT_COA_MISMATCH',
          message: 'El grupo padre pertenece a otro plan de cuentas.',
        });
      }
    }
    return this.groupModel.create(input);
  }

  listGroups(query: ListGlAccountGroupsQueryDto) {
    const where: Record<string, unknown> = {};
    if (query.coaId) where.coaId = query.coaId;
    if (query.statementType) where.statementType = query.statementType;
    if (query.classification) where.classification = query.classification;
    if (query.status) where.status = query.status;
    return this.groupModel.findAndCountAll({
      where: where as WhereOptions,
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
      order: [
        ['sortOrder', 'ASC'],
        ['code', 'ASC'],
      ],
    });
  }

  /** Devuelve el árbol anidado de grupos (para la vista de árbol contable). */
  async tree(coaId?: string): Promise<GroupTreeNode[]> {
    const where: Record<string, unknown> = {};
    if (coaId) where.coaId = coaId;
    const groups = await this.groupModel.findAll({
      where: where as WhereOptions,
      order: [
        ['sortOrder', 'ASC'],
        ['code', 'ASC'],
      ],
    });

    const byId = new Map<string, GroupTreeNode>();
    groups.forEach((group) => {
      byId.set(group.id, {
        id: group.id,
        code: group.code,
        name: group.name,
        statementType: group.statementType,
        classification: group.classification,
        subClassification: group.subClassification,
        sortOrder: group.sortOrder,
        status: group.status,
        children: [],
      });
    });

    const roots: GroupTreeNode[] = [];
    groups.forEach((group) => {
      const node = byId.get(group.id)!;
      const parent = group.parentGroupId ? byId.get(group.parentGroupId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    });
    return roots;
  }

  async getGroup(id: string): Promise<GlAccountGroupModel> {
    const group = await this.groupModel.findByPk(id);
    if (!group) {
      throw new NotFoundException({
        code: 'ACCOUNT_GROUP_NOT_FOUND',
        message: 'El grupo de cuenta informado no existe.',
      });
    }
    return group;
  }

  async updateGroup(id: string, input: UpdateGlAccountGroupDto): Promise<GlAccountGroupModel> {
    const group = await this.getGroup(id);
    if (input.parentGroupId) {
      if (input.parentGroupId === id) {
        throw new BadRequestException({
          code: 'ACCOUNT_GROUP_SELF_PARENT',
          message: 'Un grupo no puede ser su propio padre.',
        });
      }
      const parent = await this.getGroup(input.parentGroupId);
      if (parent.coaId !== group.coaId) {
        throw new BadRequestException({
          code: 'ACCOUNT_GROUP_PARENT_COA_MISMATCH',
          message: 'El grupo padre pertenece a otro plan de cuentas.',
        });
      }
    }
    await group.update({ ...input, updatedAt: new Date() });
    return group;
  }

  // ---- Vínculos multientidad de cuentas GL ----

  async createAccountLink(glAccountId: string, input: CreateEntityLinkDto) {
    const account = await this.glAccountModel.findByPk(glAccountId);
    if (!account) {
      throw new NotFoundException({
        code: 'GL_ACCOUNT_NOT_FOUND',
        message: 'La cuenta GL informada no existe.',
      });
    }
    this.logger.info('Creando vínculo de cuenta GL.', {
      layer: 'service',
      module: 'account-groups',
      action: 'createAccountLink',
      glAccountId,
      entityType: input.entityType,
      relation: input.relation,
    });
    return this.accountLinkModel.create({ ...input, glAccountId });
  }

  listAccountLinks(glAccountId: string) {
    return this.accountLinkModel.findAll({
      where: { glAccountId } as WhereOptions,
      order: [['createdAt', 'DESC']],
    });
  }

  async deleteAccountLink(id: string): Promise<{ deleted: boolean }> {
    const count = await this.accountLinkModel.destroy({ where: { id } as WhereOptions });
    if (!count) {
      throw new NotFoundException({
        code: 'GL_ACCOUNT_LINK_NOT_FOUND',
        message: 'El vínculo informado no existe.',
      });
    }
    return { deleted: true };
  }

  // ---- Vínculos multientidad de asientos ----

  createJournalLink(journalEntryId: string, input: CreateEntityLinkDto) {
    return this.journalLinkModel.create({ ...input, journalEntryId });
  }

  listJournalLinks(journalEntryId: string) {
    return this.journalLinkModel.findAll({
      where: { journalEntryId } as WhereOptions,
      order: [['createdAt', 'DESC']],
    });
  }
}
