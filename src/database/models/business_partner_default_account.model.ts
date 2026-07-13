import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'business_partner_default_account',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class BusinessPartnerDefaultAccountModel extends Model {
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

  @Column({ type: DataType.STRING(40), field: 'account_purpose', allowNull: false })
  declare accountPurpose: string;

  @Column({ type: DataType.UUID, field: 'gl_account_id', allowNull: true })
  declare glAccountId: string | null;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false, defaultValue: 'ACTIVE' })
  declare status: string;

  @Column({ type: DataType.DATE, field: 'created_at', allowNull: false, defaultValue: DataType.NOW })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, field: 'updated_at', allowNull: false, defaultValue: DataType.NOW })
  declare updatedAt: Date;
}
