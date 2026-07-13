import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'journal_entry',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class JournalEntryModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.UUID, field: 'accounting_document_id', allowNull: false })
  declare accountingDocumentId: string;

  @Column({ type: DataType.STRING(40), field: 'journal_no', allowNull: false })
  declare journalNo: string;

  @Column({ type: DataType.STRING(20), field: 'posting_status', allowNull: false })
  declare postingStatus: string;

  @Column({ type: DataType.DATE, field: 'posted_at', allowNull: true })
  declare postedAt: Date | null;

  @Column({ type: DataType.UUID, field: 'posted_by', allowNull: true })
  declare postedBy: string | null;

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
