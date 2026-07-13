import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'bp_bank_account',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class BpBankAccountModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.UUID, field: 'business_partner_id', allowNull: false })
  declare businessPartnerId: string;

  @Column({ type: DataType.STRING(120), field: 'bank_name', allowNull: false })
  declare bankName: string;

  @Column({ type: DataType.STRING(128), field: 'account_no_hash', allowNull: false })
  declare accountNoHash: string;

  @Column({ type: DataType.CHAR(3), field: 'currency_code', allowNull: false, defaultValue: 'BOB' })
  declare currencyCode: string;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false, defaultValue: 'ACTIVE' })
  declare status: string;
}
