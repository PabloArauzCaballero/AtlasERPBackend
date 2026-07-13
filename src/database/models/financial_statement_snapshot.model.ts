import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'financial_statement_snapshot',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class FinancialStatementSnapshotModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.UUID, field: 'close_run_id', allowNull: false })
  declare closeRunId: string;

  @Column({ type: DataType.STRING(40), field: 'statement_type', allowNull: false })
  declare statementType: string;

  @Column({ type: DataType.UUID, field: 'ledger_id', allowNull: false })
  declare ledgerId: string;

  @Column({ type: DataType.JSONB, field: 'snapshot_json', allowNull: false })
  declare snapshotJson: Record<string, unknown>;

  @Column({ type: DataType.STRING(64), field: 'hash_sha256', allowNull: true })
  declare hashSha256: string | null;

  @Column({
    type: DataType.DATE,
    field: 'created_at',
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare createdAt: Date;
}
