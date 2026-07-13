import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'tax_code', schema: 'atlas_accounting', timestamps: false, underscored: true })
export class TaxCodeModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.STRING(20), field: 'code', allowNull: false })
  declare code: string;

  @Column({ type: DataType.STRING(20), field: 'tax_type', allowNull: false })
  declare taxType: string;

  @Column({ type: DataType.DECIMAL(8, 4), field: 'rate', allowNull: false, defaultValue: 0 })
  declare rate: number | string;

  @Column({
    type: DataType.DECIMAL(8, 4),
    field: 'recoverable_percent',
    allowNull: false,
    defaultValue: 0,
  })
  declare recoverablePercent: number | string;

  @Column({ type: DataType.DATEONLY, field: 'effective_from', allowNull: false })
  declare effectiveFrom: Date | string;

  @Column({ type: DataType.DATEONLY, field: 'effective_to', allowNull: true })
  declare effectiveTo: Date | string | null;

  @Column({ type: DataType.UUID, field: 'output_gl_account_id', allowNull: true })
  declare outputGlAccountId: string | null;

  @Column({ type: DataType.UUID, field: 'input_gl_account_id', allowNull: true })
  declare inputGlAccountId: string | null;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false, defaultValue: 'ACTIVE' })
  declare status: string;
}
