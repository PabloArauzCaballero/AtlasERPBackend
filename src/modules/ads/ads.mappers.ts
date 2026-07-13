import type { Model } from 'sequelize-typescript';
import type { PaginatedResult } from '../../common/persistence/repositories/pagination.types';

export function serializeModel<T extends Model>(model: T): Record<string, unknown> {
  return model.toJSON() as Record<string, unknown>;
}

export function serializeModels<T extends Model>(models: T[]): Record<string, unknown>[] {
  return models.map((model) => serializeModel(model));
}

export function serializePaginated<T extends Model>(result: PaginatedResult<T>) {
  return {
    items: serializeModels(result.items),
    meta: result.meta,
  };
}

export function toPlacementResponse(placement: Model): Record<string, unknown> {
  const raw = placement.toJSON() as Record<string, unknown>;
  const allowedFormats = Array.isArray(raw.allowedFormatsJson)
    ? raw.allowedFormatsJson
    : [raw.placementType].filter(Boolean);
  return {
    ...raw,
    placementCode: raw.code,
    allowedFormats,
    floorPriceMicros: raw.pricingFloorCpmMicros,
    status: raw.isActive ? 'ACTIVE' : 'INACTIVE',
  };
}
