import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'tax_rule_version',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class TaxRuleVersionModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.STRING(20), field: 'tax_type', allowNull: false })
  declare taxType: string;

  @Column({ type: DataType.INTEGER, field: 'version_no', allowNull: false })
  declare versionNo: number;

  @Column({ type: DataType.JSONB, field: 'rule_json', allowNull: false })
  declare ruleJson: Record<string, unknown>;

  @Column({ type: DataType.DATEONLY, field: 'effective_from', allowNull: false })
  declare effectiveFrom: Date | string;

  @Column({ type: DataType.DATEONLY, field: 'effective_to', allowNull: true })
  declare effectiveTo: Date | string | null;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false, defaultValue: 'ACTIVE' })
  declare status: string;
}
