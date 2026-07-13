import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'posting_rule_version',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class PostingRuleVersionModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.STRING(60), field: 'rule_code', allowNull: false })
  declare ruleCode: string;

  @Column({ type: DataType.INTEGER, field: 'version_no', allowNull: false })
  declare versionNo: number;

  @Column({ type: DataType.STRING(40), field: 'trigger_type', allowNull: false })
  declare triggerType: string;

  @Column({ type: DataType.JSONB, field: 'rule_json', allowNull: false })
  declare ruleJson: Record<string, unknown>;

  @Column({ type: DataType.DATE, field: 'effective_from', allowNull: false })
  declare effectiveFrom: Date;

  @Column({ type: DataType.DATE, field: 'effective_to', allowNull: true })
  declare effectiveTo: Date | null;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false, defaultValue: 'ACTIVE' })
  declare status: string;
}
