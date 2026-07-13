import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { CreativeModel } from './creative.model';
import { AssetModel } from './asset.model';

@Table({ tableName: 'ad_creative_assets', timestamps: false })
export class CreativeAssetModel extends Model {
  @ForeignKey(() => CreativeModel)
  @Column({ field: 'creative_id', type: DataType.UUID, primaryKey: true })
  declare creativeId: string;
  @ForeignKey(() => AssetModel)
  @Column({ field: 'asset_id', type: DataType.UUID, primaryKey: true })
  declare assetId: string;
  @Column({
    field: 'asset_role',
    type: DataType.STRING(30),
    allowNull: false,
    defaultValue: 'PRIMARY',
  })
  declare assetRole: string;
  @Column({ field: 'sort_order', type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare sortOrder: number;
}
