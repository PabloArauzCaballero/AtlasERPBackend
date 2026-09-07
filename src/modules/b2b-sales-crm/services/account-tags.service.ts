import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import type { CreateAccountTagDto, UpdateAccountTagDto } from '../b2b-sales-crm.dtos';
import { AccountTagModel, B2BAccountTagModel } from '../models/b2b-sales-crm.models';

export interface AccountTagView {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  /** Cuántas cuentas B2B llevan hoy este tag. Es lo que decide si se puede borrar sin daño. */
  accountCount: number;
  createdAt: Date;
}

/**
 * Catálogo de tags de clasificación de cuentas B2B.
 *
 * Hasta ahora el catálogo se llenaba solo: al crear una cuenta se escribían los tags como texto y
 * el alta hacía `findOrCreate`. No había forma de listarlos, corregir uno mal escrito ni retirar el
 * que ya no se usa, y el filtro del directorio ofrecía variantes duplicadas de lo mismo.
 */
@Injectable()
export class AccountTagsService {
  constructor(
    private readonly logger: PinoLoggerService,
    @InjectModel(AccountTagModel) private readonly tagModel: typeof AccountTagModel,
    @InjectModel(B2BAccountTagModel) private readonly linkModel: typeof B2BAccountTagModel,
  ) {}

  async list(): Promise<AccountTagView[]> {
    const [tags, links] = await Promise.all([
      this.tagModel.findAll({ order: [['name', 'ASC']] }),
      this.linkModel.findAll({ attributes: ['tagId'] }),
    ]);
    const counts = new Map<string, number>();
    for (const link of links) {
      counts.set(link.tagId, (counts.get(link.tagId) ?? 0) + 1);
    }
    return tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      description: tag.description,
      isActive: tag.isActive,
      accountCount: counts.get(tag.id) ?? 0,
      createdAt: tag.createdAt,
    }));
  }

  async create(input: CreateAccountTagDto): Promise<AccountTagModel> {
    const existing = await this.tagModel.findOne({ where: { name: input.name } });
    if (existing) {
      throw new ConflictException(`El tag «${input.name}» ya existe.`);
    }
    this.logger.infoContext(AccountTagsService.name, 'Creando tag de clasificación', {
      name: input.name,
    });
    return this.tagModel.create({
      name: input.name,
      description: input.description ?? null,
      isActive: input.isActive ?? true,
    });
  }

  private async get(id: string): Promise<AccountTagModel> {
    const tag = await this.tagModel.findByPk(id);
    if (!tag) {
      throw new NotFoundException('Tag de clasificación no encontrado.');
    }
    return tag;
  }

  async update(id: string, input: UpdateAccountTagDto): Promise<AccountTagModel> {
    const tag = await this.get(id);
    if (input.name && input.name !== tag.name) {
      const clash = await this.tagModel.findOne({ where: { name: input.name } });
      if (clash) {
        throw new ConflictException(`Ya existe otro tag llamado «${input.name}».`);
      }
    }
    await tag.update(input);
    return tag;
  }

  /**
   * Borra el tag y, con él, su asignación a las cuentas que lo llevaban.
   *
   * No se borra en silencio: si el tag está en uso se dice a cuántas cuentas afecta y se exige
   * repetir la llamada con `force`. Un tag es una clasificación, no un dato del negocio —perderlo no
   * rompe nada—, pero quien lo borra debería saber que está reclasificando 40 cuentas de golpe.
   */
  async remove(
    id: string,
    force: boolean,
  ): Promise<{ id: string; name: string; unlinkedAccounts: number }> {
    const tag = await this.get(id);
    const inUse = await this.linkModel.count({ where: { tagId: id } });
    if (inUse > 0 && !force) {
      throw new ConflictException(
        `El tag «${tag.name}» está asignado a ${inUse} cuenta(s). Vuelve a confirmar para quitarlo de todas ellas.`,
      );
    }
    await this.linkModel.destroy({ where: { tagId: id } });
    await tag.destroy();
    this.logger.infoContext(AccountTagsService.name, 'Tag de clasificación eliminado', {
      name: tag.name,
      unlinkedAccounts: inUse,
    });
    return { id, name: tag.name, unlinkedAccounts: inUse };
  }
}
