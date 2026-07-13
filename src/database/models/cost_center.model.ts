import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'cost_center',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class CostCenterModel extends Model {
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

  @Column({ type: DataType.STRING(20), field: 'code', allowNull: false })
  declare code: string;

  @Column({ type: DataType.STRING(120), field: 'name', allowNull: false })
  declare name: string;

  @Column({ type: DataType.UUID, field: 'manager_bp_id', allowNull: true })
  declare managerBpId: string | null;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false, defaultValue: 'ACTIVE' })
  declare status: string;
}
