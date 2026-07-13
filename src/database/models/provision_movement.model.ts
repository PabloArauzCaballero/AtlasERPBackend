import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'provision_movement',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class ProvisionMovementModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.UUID, field: 'provision_case_id', allowNull: false })
  declare provisionCaseId: string;

  @Column({ type: DataType.DATEONLY, field: 'movement_date', allowNull: false })
  declare movementDate: Date | string;

  @Column({ type: DataType.STRING(20), field: 'movement_type', allowNull: false })
  declare movementType: string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'amount', allowNull: false })
  declare amount: number | string;

  @Column({ type: DataType.UUID, field: 'journal_entry_id', allowNull: true })
  declare journalEntryId: string | null;
}
