import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'receipt', schema: 'atlas_accounting', timestamps: false, underscored: true })
export class ReceiptModel extends Model {
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

  @Column({ type: DataType.UUID, field: 'payer_bp_id', allowNull: false })
  declare payerBpId: string;

  @Column({ type: DataType.STRING(40), field: 'receipt_no', allowNull: false })
  declare receiptNo: string;

  @Column({ type: DataType.DATEONLY, field: 'receipt_date', allowNull: false })
  declare receiptDate: Date | string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'amount', allowNull: false })
  declare amount: number | string;

  @Column({ type: DataType.CHAR(3), field: 'currency_code', allowNull: false, defaultValue: 'BOB' })
  declare currencyCode: string;

  @Column({ type: DataType.UUID, field: 'bank_account_id', allowNull: true })
  declare bankAccountId: string | null;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false })
  declare status: string;

  @Column({ type: DataType.UUID, field: 'accounting_document_id', allowNull: true })
  declare accountingDocumentId: string | null;
}
