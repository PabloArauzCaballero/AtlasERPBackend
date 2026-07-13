import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  modelName: 'AccountingReconciliationItemModel',
  tableName: 'reconciliation_item',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class ReconciliationItemModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.UUID, field: 'reconciliation_run_id', allowNull: false })
  declare reconciliationRunId: string;

  @Column({ type: DataType.STRING(30), field: 'left_ref_type', allowNull: false })
  declare leftRefType: string;

  @Column({ type: DataType.UUID, field: 'left_ref_id', allowNull: false })
  declare leftRefId: string;

  @Column({ type: DataType.STRING(30), field: 'right_ref_type', allowNull: true })
  declare rightRefType: string | null;

  @Column({ type: DataType.UUID, field: 'right_ref_id', allowNull: true })
  declare rightRefId: string | null;

  @Column({
    type: DataType.DECIMAL(18, 2),
    field: 'difference_amount',
    allowNull: false,
    defaultValue: 0,
  })
  declare differenceAmount: number | string;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false, defaultValue: 'OPEN' })
  declare status: string;

  @Column({ type: DataType.STRING(300), field: 'resolution_note', allowNull: true })
  declare resolutionNote: string | null;
}
