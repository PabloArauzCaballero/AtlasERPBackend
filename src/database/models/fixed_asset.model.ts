import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'fixed_asset',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class FixedAssetModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.UUID, field: 'legal_entity_id', allowNull: false })
  declare legalEntityId: string;

  @Column({ type: DataType.STRING(40), field: 'asset_no', allowNull: false })
  declare assetNo: string;

  @Column({ type: DataType.STRING(30), field: 'asset_class', allowNull: false })
  declare assetClass: string;

  @Column({ type: DataType.STRING(240), field: 'description', allowNull: false })
  declare description: string;

  @Column({ type: DataType.DATEONLY, field: 'acquisition_date', allowNull: false })
  declare acquisitionDate: Date | string;

  @Column({ type: DataType.DATEONLY, field: 'placed_in_service_date', allowNull: true })
  declare placedInServiceDate: Date | string | null;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'cost', allowNull: false })
  declare cost: number | string;

  @Column({ type: DataType.CHAR(3), field: 'currency_code', allowNull: false, defaultValue: 'BOB' })
  declare currencyCode: string;

  @Column({ type: DataType.INTEGER, field: 'useful_life_months', allowNull: false })
  declare usefulLifeMonths: number;

  @Column({ type: DataType.STRING(20), field: 'depreciation_method', allowNull: false })
  declare depreciationMethod: string;

  @Column({
    type: DataType.DECIMAL(18, 2),
    field: 'residual_value',
    allowNull: false,
    defaultValue: 0,
  })
  declare residualValue: number | string;

  @Column({ type: DataType.UUID, field: 'asset_gl_account_id', allowNull: true })
  declare assetGlAccountId: string | null;

  @Column({ type: DataType.UUID, field: 'accumulated_depr_gl_account_id', allowNull: true })
  declare accumulatedDeprGlAccountId: string | null;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false })
  declare status: string;
}
