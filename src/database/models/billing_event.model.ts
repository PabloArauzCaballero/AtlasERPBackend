import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'billing_event',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class BillingEventModel extends Model {
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

  @Column({ type: DataType.STRING(30), field: 'event_type', allowNull: false })
  declare eventType: string;

  @Column({ type: DataType.DATE, field: 'event_time', allowNull: false })
  declare eventTime: Date;

  @Column({ type: DataType.DECIMAL(18, 6), field: 'quantity', allowNull: false, defaultValue: 1 })
  declare quantity: number | string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'base_amount', allowNull: false })
  declare baseAmount: number | string;

  @Column({ type: DataType.CHAR(3), field: 'currency_code', allowNull: false, defaultValue: 'BOB' })
  declare currencyCode: string;

  @Column({ type: DataType.STRING(100), field: 'external_ref', allowNull: true })
  declare externalRef: string | null;

  @Column({ type: DataType.JSONB, field: 'payload', allowNull: false })
  declare payload: Record<string, unknown>;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false })
  declare status: string;

  @Column({
    type: DataType.DATE,
    field: 'created_at',
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare createdAt: Date;
}
