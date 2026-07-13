import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'ar_invoice_line',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class ArInvoiceLineModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.UUID, field: 'ar_invoice_id', allowNull: false })
  declare arInvoiceId: string;

  @Column({ type: DataType.SMALLINT, field: 'line_no', allowNull: false })
  declare lineNo: number;

  @Column({ type: DataType.UUID, field: 'billing_event_id', allowNull: true })
  declare billingEventId: string | null;

  @Column({ type: DataType.UUID, field: 'revenue_account_id', allowNull: false })
  declare revenueAccountId: string;

  @Column({ type: DataType.UUID, field: 'tax_code_id', allowNull: true })
  declare taxCodeId: string | null;

  @Column({ type: DataType.STRING(240), field: 'description', allowNull: false })
  declare description: string;

  @Column({ type: DataType.DECIMAL(18, 6), field: 'qty', allowNull: false, defaultValue: 1 })
  declare qty: number | string;

  @Column({ type: DataType.DECIMAL(18, 6), field: 'unit_price', allowNull: false, defaultValue: 0 })
  declare unitPrice: number | string;

  @Column({
    type: DataType.DECIMAL(18, 2),
    field: 'line_amount',
    allowNull: false,
    defaultValue: 0,
  })
  declare lineAmount: number | string;
}
