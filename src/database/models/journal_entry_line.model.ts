import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'journal_entry_line',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class JournalEntryLineModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.UUID, field: 'journal_entry_id', allowNull: false })
  declare journalEntryId: string;

  @Column({ type: DataType.SMALLINT, field: 'line_no', allowNull: false })
  declare lineNo: number;

  @Column({ type: DataType.UUID, field: 'gl_account_id', allowNull: false })
  declare glAccountId: string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'debit', allowNull: false, defaultValue: 0 })
  declare debit: number | string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'credit', allowNull: false, defaultValue: 0 })
  declare credit: number | string;

  @Column({ type: DataType.CHAR(3), field: 'currency_code', allowNull: false, defaultValue: 'BOB' })
  declare currencyCode: string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'amount_lc', allowNull: false, defaultValue: 0 })
  declare amountLc: number | string;

  @Column({ type: DataType.UUID, field: 'partner_id', allowNull: true })
  declare partnerId: string | null;

  @Column({ type: DataType.UUID, field: 'cost_center_id', allowNull: true })
  declare costCenterId: string | null;

  @Column({ type: DataType.UUID, field: 'profit_center_id', allowNull: true })
  declare profitCenterId: string | null;

  @Column({ type: DataType.UUID, field: 'tax_code_id', allowNull: true })
  declare taxCodeId: string | null;

  @Column({ type: DataType.STRING(30), field: 'reference_type', allowNull: true })
  declare referenceType: string | null;

  @Column({ type: DataType.UUID, field: 'reference_id', allowNull: true })
  declare referenceId: string | null;

  @Column({ type: DataType.STRING(240), field: 'description', allowNull: true })
  declare description: string | null;

  @Column({
    type: DataType.DATE,
    field: 'created_at',
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare createdAt: Date;
}
