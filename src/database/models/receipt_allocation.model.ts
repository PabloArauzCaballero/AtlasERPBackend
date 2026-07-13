import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'receipt_allocation',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class ReceiptAllocationModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.UUID, field: 'receipt_id', allowNull: false })
  declare receiptId: string;

  @Column({ type: DataType.UUID, field: 'ar_invoice_id', allowNull: false })
  declare arInvoiceId: string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'allocated_amount', allowNull: false })
  declare allocatedAmount: number | string;

  @Column({
    type: DataType.DATE,
    field: 'created_at',
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare createdAt: Date;
}
