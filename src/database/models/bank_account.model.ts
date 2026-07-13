import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'bank_account',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class BankAccountModel extends Model {
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

  @Column({ type: DataType.UUID, field: 'bank_bp_id', allowNull: true })
  declare bankBpId: string | null;

  @Column({ type: DataType.STRING(160), field: 'account_name', allowNull: false })
  declare accountName: string;

  @Column({ type: DataType.CHAR(3), field: 'currency_code', allowNull: false, defaultValue: 'BOB' })
  declare currencyCode: string;

  @Column({ type: DataType.STRING(128), field: 'account_no_hash', allowNull: false })
  declare accountNoHash: string;

  @Column({ type: DataType.UUID, field: 'gl_account_id', allowNull: true })
  declare glAccountId: string | null;

  @Column({ type: DataType.BOOLEAN, field: 'is_house_bank', allowNull: false, defaultValue: true })
  declare isHouseBank: boolean;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false, defaultValue: 'ACTIVE' })
  declare status: string;
}
