import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'gl_account_group',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class GlAccountGroupModel extends Model {
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

  @Column({ type: DataType.UUID, field: 'parent_group_id', allowNull: true })
  declare parentGroupId: string | null;

  @Column({ type: DataType.STRING(30), field: 'code', allowNull: false })
  declare code: string;

  @Column({ type: DataType.STRING(160), field: 'name', allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING(30), field: 'statement_type', allowNull: false })
  declare statementType: string;

  @Column({ type: DataType.STRING(30), field: 'classification', allowNull: false })
  declare classification: string;

  @Column({ type: DataType.STRING(40), field: 'sub_classification', allowNull: true })
  declare subClassification: string | null;

  @Column({ type: DataType.INTEGER, field: 'sort_order', allowNull: false, defaultValue: 0 })
  declare sortOrder: number;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false, defaultValue: 'ACTIVE' })
  declare status: string;

  @Column({ type: DataType.DATE, field: 'created_at', allowNull: false, defaultValue: DataType.NOW })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, field: 'updated_at', allowNull: false, defaultValue: DataType.NOW })
  declare updatedAt: Date;
}
