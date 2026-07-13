import { BelongsToMany, Column, DataType, HasMany, Model, Table } from 'sequelize-typescript';
import { AdSetModel } from './ad-set.model';
import { AdSetPlacementModel } from './ad-set-placement.model';
import { DeliveryDecisionModel } from './delivery-decision.model';

@Table({
  tableName: 'ad_inventory_placements',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
})
export class InventoryPlacementModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;
  @Column({ type: DataType.STRING(80), allowNull: false, unique: true }) declare code: string;
  @Column({ type: DataType.STRING(80), allowNull: false }) declare surface: string;
  @Column({ field: 'placement_type', type: DataType.STRING(40), allowNull: false })
  declare placementType: string;
  @Column({
    field: 'allowed_formats_json',
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: [],
  })
  declare allowedFormatsJson: string[];
  @Column({
    field: 'billing_model',
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: 'CPM',
  })
  declare billingModel: string;
  @Column({ field: 'width_px', type: DataType.INTEGER, allowNull: true }) declare widthPx:
    number | null;
  @Column({ field: 'height_px', type: DataType.INTEGER, allowNull: true }) declare heightPx:
    number | null;
  @Column({
    field: 'supports_video',
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  declare supportsVideo: boolean;
  @Column({
    field: 'pricing_floor_cpm_micros',
    type: DataType.BIGINT,
    allowNull: false,
    defaultValue: 0,
  })
  declare pricingFloorCpmMicros: number;
  @Column({ field: 'is_active', type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare isActive: boolean;
  @BelongsToMany(() => AdSetModel, () => AdSetPlacementModel) declare adSets?: AdSetModel[];
  @HasMany(() => DeliveryDecisionModel, 'placement_id')
  declare deliveryDecisions?: DeliveryDecisionModel[];
}
