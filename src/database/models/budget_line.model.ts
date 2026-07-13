import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'budget_line',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class BudgetLineModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.UUID, field: 'budget_id', allowNull: false })
  declare budgetId: string;

  @Column({ type: DataType.UUID, field: 'gl_account_id', allowNull: false })
  declare glAccountId: string;

  @Column({ type: DataType.UUID, field: 'cost_center_id', allowNull: true })
  declare costCenterId: string | null;

  @Column({ type: DataType.UUID, field: 'profit_center_id', allowNull: true })
  declare profitCenterId: string | null;

  @Column({ type: DataType.SMALLINT, field: 'period_no', allowNull: false })
  declare periodNo: number;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'amount', allowNull: false, defaultValue: 0 })
  declare amount: number | string;
}
