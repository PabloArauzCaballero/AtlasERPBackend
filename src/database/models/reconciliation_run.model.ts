import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  modelName: 'AccountingReconciliationRunModel',
  tableName: 'reconciliation_run',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class ReconciliationRunModel extends Model {
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

  @Column({ type: DataType.UUID, field: 'period_id', allowNull: true })
  declare periodId: string | null;

  @Column({ type: DataType.STRING(30), field: 'reconciliation_type', allowNull: false })
  declare reconciliationType: string;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false })
  declare status: string;

  @Column({
    type: DataType.DATE,
    field: 'started_at',
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare startedAt: Date;

  @Column({ type: DataType.DATE, field: 'completed_at', allowNull: true })
  declare completedAt: Date | null;
}
