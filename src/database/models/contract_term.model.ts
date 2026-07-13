import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'contract_term',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class ContractTermModel extends Model {
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

  @Column({ type: DataType.STRING(40), field: 'term_code', allowNull: false })
  declare termCode: string;

  @Column({ type: DataType.JSONB, field: 'term_value_json', allowNull: false })
  declare termValueJson: Record<string, unknown>;

  @Column({
    type: DataType.DATEONLY,
    field: 'effective_from',
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare effectiveFrom: Date | string;

  @Column({ type: DataType.DATEONLY, field: 'effective_to', allowNull: true })
  declare effectiveTo: Date | string | null;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false, defaultValue: 'ACTIVE' })
  declare status: string;
}
