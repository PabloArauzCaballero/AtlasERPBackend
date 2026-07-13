import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'ad_policy_rules',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
})
export class PolicyRuleModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;
  @Column({ field: 'policy_code', type: DataType.STRING(100), allowNull: false, unique: true })
  declare policyCode: string;
  @Column({ type: DataType.STRING(80), allowNull: false }) declare category: string;
  @Column({ field: 'rule_type', type: DataType.STRING(50), allowNull: false })
  declare ruleType: string;
  @Column({ type: DataType.STRING(20), allowNull: false, defaultValue: 'MEDIUM' })
  declare severity: string;
  @Column({ type: DataType.TEXT, allowNull: false }) declare description: string;
  @Column({ field: 'is_active', type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare isActive: boolean;
  @Column({ field: 'created_by', type: DataType.UUID, allowNull: true }) declare createdBy:
    string | null;
  @Column({ field: 'updated_by', type: DataType.UUID, allowNull: true }) declare updatedBy:
    string | null;
}
