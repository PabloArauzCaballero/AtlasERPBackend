import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'asset_depreciation_run',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class AssetDepreciationRunModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.UUID, field: 'fixed_asset_id', allowNull: false })
  declare fixedAssetId: string;

  @Column({ type: DataType.UUID, field: 'period_id', allowNull: false })
  declare periodId: string;

  @Column({
    type: DataType.DECIMAL(18, 2),
    field: 'depreciation_amount',
    allowNull: false,
    defaultValue: 0,
  })
  declare depreciationAmount: number | string;

  @Column({ type: DataType.UUID, field: 'journal_entry_id', allowNull: true })
  declare journalEntryId: string | null;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false })
  declare status: string;
}
