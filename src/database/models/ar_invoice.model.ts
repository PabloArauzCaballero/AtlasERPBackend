import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'ar_invoice',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class ArInvoiceModel extends Model {
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

  @Column({ type: DataType.UUID, field: 'customer_bp_id', allowNull: false })
  declare customerBpId: string;

  @Column({ type: DataType.UUID, field: 'contract_id', allowNull: true })
  declare contractId: string | null;

  @Column({ type: DataType.STRING(40), field: 'invoice_no', allowNull: false })
  declare invoiceNo: string;

  @Column({ type: DataType.DATEONLY, field: 'invoice_date', allowNull: false })
  declare invoiceDate: Date | string;

  @Column({ type: DataType.DATEONLY, field: 'due_date', allowNull: false })
  declare dueDate: Date | string;

  @Column({ type: DataType.CHAR(3), field: 'currency_code', allowNull: false, defaultValue: 'BOB' })
  declare currencyCode: string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'net_amount', allowNull: false, defaultValue: 0 })
  declare netAmount: number | string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'tax_amount', allowNull: false, defaultValue: 0 })
  declare taxAmount: number | string;

  @Column({
    type: DataType.DECIMAL(18, 2),
    field: 'gross_amount',
    allowNull: false,
    defaultValue: 0,
  })
  declare grossAmount: number | string;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false })
  declare status: string;

  @Column({ type: DataType.UUID, field: 'accounting_document_id', allowNull: true })
  declare accountingDocumentId: string | null;

  @Column({
    type: DataType.DATE,
    field: 'created_at',
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare createdAt: Date;
}
