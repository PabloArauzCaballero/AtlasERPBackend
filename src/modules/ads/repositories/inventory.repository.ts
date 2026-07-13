import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { type Transaction, type WhereOptions } from 'sequelize';
import { PinoLogger } from 'nestjs-pino';
import { createCrudRepository } from '../../../common/persistence/repositories/create-crud-repository';
import { InventoryPlacementModel } from '../models';
import type { CreateInventoryPlacementDto, ListInventoryQueryDto } from '../ads.dtos';

@Injectable()
export class InventoryRepository {
  private readonly baseRepository;

  constructor(
    @InjectModel(InventoryPlacementModel)
    private readonly placementModel: typeof InventoryPlacementModel,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(InventoryRepository.name);
    this.baseRepository = createCrudRepository({ model: this.placementModel, primaryKey: 'id' });
  }

  list(query: ListInventoryQueryDto) {
    const where: WhereOptions = {};
    if (query.surface) where.surface = query.surface;
    if (query.status) where.is_active = query.status === 'ACTIVE';
    return this.baseRepository.paginate(where, query.page, query.limit, {
      order: [['created_at', 'DESC']],
    });
  }

  create(
    input: CreateInventoryPlacementDto,
    transaction?: Transaction,
  ): Promise<InventoryPlacementModel> {
    const firstFormat = input.allowedFormats[0] ?? 'IMAGE_BANNER';
    this.logger.info({ placementCode: input.placementCode }, 'Creating inventory placement');
    return this.placementModel.create(
      {
        code: input.placementCode,
        surface: input.surface,
        placementType: firstFormat,
        allowedFormatsJson: input.allowedFormats,
        billingModel: input.billingModel,
        pricingFloorCpmMicros: input.floorPriceMicros,
        isActive: input.status === 'ACTIVE',
        supportsVideo: input.allowedFormats.some((format) =>
          format.toUpperCase().includes('VIDEO'),
        ),
        widthPx: input.widthPx ?? null,
        heightPx: input.heightPx ?? null,
      },
      { transaction },
    );
  }

  findActiveByCode(code: string): Promise<InventoryPlacementModel | null> {
    return this.placementModel.findOne({ where: { code, isActive: true } });
  }
}
