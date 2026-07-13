import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'billing_rule',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class BillingRuleModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.UUID, field: 'contract_id', allowNull: false })
  declare contractId: string;

  @Column({ type: DataType.STRING(30), field: 'fee_type', allowNull: false })
  declare feeType: string;

  @Column({ type: DataType.STRING(20), field: 'calc_method', allowNull: false })
  declare calcMethod: string;

  @Column({ type: DataType.DECIMAL(12, 6), field: 'rate', allowNull: true })
  declare rate: number | string | null;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'fixed_amount', allowNull: true })
  declare fixedAmount: number | string | null;

  @Column({ type: DataType.UUID, field: 'revenue_account_id', allowNull: false })
  declare revenueAccountId: string;

  @Column({ type: DataType.UUID, field: 'tax_code_id', allowNull: true })
  declare taxCodeId: string | null;

  @Column({ type: DataType.BOOLEAN, field: 'defer_revenue', allowNull: false, defaultValue: false })
  declare deferRevenue: boolean;

  @Column({ type: DataType.DATEONLY, field: 'effective_from', allowNull: false })
  declare effectiveFrom: Date | string;

  @Column({ type: DataType.DATEONLY, field: 'effective_to', allowNull: true })
  declare effectiveTo: Date | string | null;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false, defaultValue: 'ACTIVE' })
  declare status: string;
}
