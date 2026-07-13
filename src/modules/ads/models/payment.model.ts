import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { InvoiceModel } from './invoice.model';

@Table({ tableName: 'ad_payments', timestamps: true, createdAt: 'created_at', updatedAt: false })
export class PaymentModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;
  @ForeignKey(() => InvoiceModel)
  @Column({ field: 'invoice_id', type: DataType.UUID, allowNull: false })
  declare invoiceId: string;
  @Column({ field: 'amount_micros', type: DataType.BIGINT, allowNull: false })
  declare amountMicros: number;
  @Column({ type: DataType.CHAR(3), allowNull: false, defaultValue: 'BOB' })
  declare currency: string;
  @Column({ field: 'payment_method', type: DataType.STRING(40), allowNull: true })
  declare paymentMethod: string | null;
  @Column({ field: 'external_reference', type: DataType.STRING(120), allowNull: true })
  declare externalReference: string | null;
  @Column({ type: DataType.STRING(30), allowNull: false, defaultValue: 'CONFIRMED' })
  declare status: string;
  @Column({ field: 'paid_at', type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  declare paidAt: Date;
  @BelongsTo(() => InvoiceModel, 'invoice_id') declare invoice?: InvoiceModel;
}
