import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'supplier_payment',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class SupplierPaymentModel extends Model {
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

  @Column({ type: DataType.UUID, field: 'payment_order_id', allowNull: true })
  declare paymentOrderId: string | null;

  @Column({ type: DataType.DATEONLY, field: 'payment_date', allowNull: false })
  declare paymentDate: Date | string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'amount', allowNull: false })
  declare amount: number | string;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false })
  declare status: string;

  @Column({ type: DataType.UUID, field: 'accounting_document_id', allowNull: true })
  declare accountingDocumentId: string | null;
}
