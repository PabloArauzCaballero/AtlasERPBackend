import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'budget', schema: 'atlas_accounting', timestamps: false, underscored: true })
export class BudgetModel extends Model {
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

  @Column({ type: DataType.UUID, field: 'fiscal_year_id', allowNull: false })
  declare fiscalYearId: string;

  @Column({ type: DataType.INTEGER, field: 'version_no', allowNull: false, defaultValue: 1 })
  declare versionNo: number;

  @Column({ type: DataType.STRING(120), field: 'name', allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false })
  declare status: string;

  @Column({ type: DataType.UUID, field: 'approved_by', allowNull: true })
  declare approvedBy: string | null;

  @Column({ type: DataType.DATE, field: 'approved_at', allowNull: true })
  declare approvedAt: Date | null;
}
