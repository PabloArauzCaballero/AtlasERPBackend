import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'chart_of_accounts',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class ChartOfAccountsModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.STRING(20), field: 'code', allowNull: false })
  declare code: string;

  @Column({ type: DataType.STRING(120), field: 'name', allowNull: false })
  declare name: string;

  @Column({ type: DataType.INTEGER, field: 'version_no', allowNull: false, defaultValue: 1 })
  declare versionNo: number;

  @Column({ type: DataType.DATEONLY, field: 'effective_from', allowNull: false })
  declare effectiveFrom: Date | string;

  @Column({ type: DataType.DATEONLY, field: 'effective_to', allowNull: true })
  declare effectiveTo: Date | string | null;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false, defaultValue: 'ACTIVE' })
  declare status: string;
}
