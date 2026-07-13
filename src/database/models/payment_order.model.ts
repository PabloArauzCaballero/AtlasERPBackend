import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'payment_order',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class PaymentOrderModel extends Model {
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

  @Column({ type: DataType.UUID, field: 'payee_bp_id', allowNull: false })
  declare payeeBpId: string;

  @Column({ type: DataType.UUID, field: 'bank_account_id', allowNull: true })
  declare bankAccountId: string | null;

  @Column({ type: DataType.STRING(30), field: 'payment_type', allowNull: false })
  declare paymentType: string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'requested_amount', allowNull: false })
  declare requestedAmount: number | string;

  @Column({ type: DataType.CHAR(3), field: 'currency_code', allowNull: false, defaultValue: 'BOB' })
  declare currencyCode: string;

  @Column({ type: DataType.DATEONLY, field: 'requested_date', allowNull: false })
  declare requestedDate: Date | string;

  @Column({ type: DataType.UUID, field: 'approved_by', allowNull: true })
  declare approvedBy: string | null;

  @Column({ type: DataType.DATE, field: 'approved_at', allowNull: true })
  declare approvedAt: Date | null;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false })
  declare status: string;
}
