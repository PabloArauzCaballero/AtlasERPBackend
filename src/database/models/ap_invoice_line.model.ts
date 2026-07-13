import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'ap_invoice_line',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class ApInvoiceLineModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.UUID, field: 'ap_invoice_id', allowNull: false })
  declare apInvoiceId: string;

  @Column({ type: DataType.SMALLINT, field: 'line_no', allowNull: false })
  declare lineNo: number;

  @Column({ type: DataType.UUID, field: 'expense_account_id', allowNull: false })
  declare expenseAccountId: string;

  @Column({ type: DataType.UUID, field: 'tax_code_id', allowNull: true })
  declare taxCodeId: string | null;

  @Column({ type: DataType.UUID, field: 'cost_center_id', allowNull: true })
  declare costCenterId: string | null;

  @Column({ type: DataType.STRING(240), field: 'description', allowNull: false })
  declare description: string;

  @Column({
    type: DataType.DECIMAL(18, 2),
    field: 'line_amount',
    allowNull: false,
    defaultValue: 0,
  })
  declare lineAmount: number | string;
}
