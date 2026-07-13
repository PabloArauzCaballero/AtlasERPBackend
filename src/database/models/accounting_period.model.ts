import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'accounting_period',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class AccountingPeriodModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.UUID, field: 'fiscal_year_id', allowNull: false })
  declare fiscalYearId: string;

  @Column({ type: DataType.SMALLINT, field: 'period_no', allowNull: false })
  declare periodNo: number;

  @Column({ type: DataType.DATEONLY, field: 'start_date', allowNull: false })
  declare startDate: Date | string;

  @Column({ type: DataType.DATEONLY, field: 'end_date', allowNull: false })
  declare endDate: Date | string;

  @Column({ type: DataType.BOOLEAN, field: 'is_open', allowNull: false, defaultValue: true })
  declare isOpen: boolean;

  @Column({
    type: DataType.STRING(20),
    field: 'close_status',
    allowNull: false,
    defaultValue: 'OPEN',
  })
  declare closeStatus: string;

  @Column({ type: DataType.DATE, field: 'closed_at', allowNull: true })
  declare closedAt: Date | null;

  @Column({ type: DataType.UUID, field: 'closed_by', allowNull: true })
  declare closedBy: string | null;
}
