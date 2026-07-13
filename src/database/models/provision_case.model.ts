import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'provision_case',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class ProvisionCaseModel extends Model {
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

  @Column({ type: DataType.STRING(30), field: 'case_type', allowNull: false })
  declare caseType: string;

  @Column({ type: DataType.UUID, field: 'counterparty_bp_id', allowNull: true })
  declare counterpartyBpId: string | null;

  @Column({ type: DataType.DATEONLY, field: 'obligating_event_date', allowNull: false })
  declare obligatingEventDate: Date | string;

  @Column({ type: DataType.STRING(30), field: 'policy_basis', allowNull: false })
  declare policyBasis: string;

  @Column({ type: DataType.STRING(20), field: 'probability_bucket', allowNull: false })
  declare probabilityBucket: string;

  @Column({
    type: DataType.DECIMAL(18, 2),
    field: 'best_estimate',
    allowNull: false,
    defaultValue: 0,
  })
  declare bestEstimate: number | string;

  @Column({ type: DataType.CHAR(3), field: 'currency_code', allowNull: false, defaultValue: 'BOB' })
  declare currencyCode: string;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false, defaultValue: 'OPEN' })
  declare status: string;
}
