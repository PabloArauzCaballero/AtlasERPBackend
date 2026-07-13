import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { AdSetModel } from './ad-set.model';
import { InventoryPlacementModel } from './inventory-placement.model';

@Table({ tableName: 'ad_ad_set_placements', timestamps: false })
export class AdSetPlacementModel extends Model {
  @ForeignKey(() => AdSetModel)
  @Column({ field: 'ad_set_id', type: DataType.UUID, primaryKey: true })
  declare adSetId: string;
  @ForeignKey(() => InventoryPlacementModel)
  @Column({ field: 'placement_id', type: DataType.UUID, primaryKey: true })
  declare placementId: string;
}
