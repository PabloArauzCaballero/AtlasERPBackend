import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'fiscal_year',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class FiscalYearModel extends Model {
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

  @Column({ type: DataType.STRING(10), field: 'year_label', allowNull: false })
  declare yearLabel: string;

  @Column({ type: DataType.DATEONLY, field: 'start_date', allowNull: false })
  declare startDate: Date | string;

  @Column({ type: DataType.DATEONLY, field: 'end_date', allowNull: false })
  declare endDate: Date | string;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false, defaultValue: 'OPEN' })
  declare status: string;
}
