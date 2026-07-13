import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'bank_statement',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class BankStatementModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.UUID, field: 'bank_account_id', allowNull: false })
  declare bankAccountId: string;

  @Column({ type: DataType.STRING(60), field: 'statement_no', allowNull: false })
  declare statementNo: string;

  @Column({ type: DataType.DATEONLY, field: 'statement_date', allowNull: false })
  declare statementDate: Date | string;

  @Column({
    type: DataType.DECIMAL(18, 2),
    field: 'opening_balance',
    allowNull: false,
    defaultValue: 0,
  })
  declare openingBalance: number | string;

  @Column({
    type: DataType.DECIMAL(18, 2),
    field: 'closing_balance',
    allowNull: false,
    defaultValue: 0,
  })
  declare closingBalance: number | string;

  @Column({ type: DataType.STRING(240), field: 'source_file_key', allowNull: true })
  declare sourceFileKey: string | null;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false })
  declare status: string;
}
