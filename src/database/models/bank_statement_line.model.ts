import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'bank_statement_line',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class BankStatementLineModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.UUID, field: 'bank_statement_id', allowNull: false })
  declare bankStatementId: string;

  @Column({ type: DataType.INTEGER, field: 'line_no', allowNull: false })
  declare lineNo: number;

  @Column({ type: DataType.DATEONLY, field: 'value_date', allowNull: false })
  declare valueDate: Date | string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'amount', allowNull: false })
  declare amount: number | string;

  @Column({ type: DataType.CHAR(3), field: 'currency_code', allowNull: false, defaultValue: 'BOB' })
  declare currencyCode: string;

  @Column({ type: DataType.STRING(140), field: 'bank_ref', allowNull: true })
  declare bankRef: string | null;

  @Column({ type: DataType.STRING(240), field: 'memo', allowNull: true })
  declare memo: string | null;

  @Column({ type: DataType.STRING(20), field: 'match_status', allowNull: false })
  declare matchStatus: string;

  @Column({ type: DataType.STRING(30), field: 'matched_ref_type', allowNull: true })
  declare matchedRefType: string | null;

  @Column({ type: DataType.UUID, field: 'matched_ref_id', allowNull: true })
  declare matchedRefId: string | null;
}
