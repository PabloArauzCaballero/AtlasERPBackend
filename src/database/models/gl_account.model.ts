import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'gl_account',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class GlAccountModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.UUID, field: 'coa_id', allowNull: false })
  declare coaId: string;

  @Column({ type: DataType.UUID, field: 'parent_account_id', allowNull: true })
  declare parentAccountId: string | null;

  @Column({ type: DataType.STRING(20), field: 'account_no', allowNull: false })
  declare accountNo: string;

  @Column({ type: DataType.STRING(160), field: 'name', allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING(30), field: 'account_type', allowNull: false })
  declare accountType: string;

  @Column({ type: DataType.CHAR(1), field: 'normal_balance', allowNull: false })
  declare normalBalance: string;

  @Column({
    type: DataType.BOOLEAN,
    field: 'is_control_account',
    allowNull: false,
    defaultValue: false,
  })
  declare isControlAccount: boolean;

  @Column({
    type: DataType.BOOLEAN,
    field: 'requires_cost_center',
    allowNull: false,
    defaultValue: false,
  })
  declare requiresCostCenter: boolean;

  @Column({
    type: DataType.BOOLEAN,
    field: 'requires_profit_center',
    allowNull: false,
    defaultValue: false,
  })
  declare requiresProfitCenter: boolean;

  @Column({
    type: DataType.BOOLEAN,
    field: 'requires_partner',
    allowNull: false,
    defaultValue: false,
  })
  declare requiresPartner: boolean;

  @Column({
    type: DataType.BOOLEAN,
    field: 'requires_tax_code',
    allowNull: false,
    defaultValue: false,
  })
  declare requiresTaxCode: boolean;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false, defaultValue: 'ACTIVE' })
  declare status: string;

  @Column({ type: DataType.UUID, field: 'account_group_id', allowNull: true })
  declare accountGroupId: string | null;
}
