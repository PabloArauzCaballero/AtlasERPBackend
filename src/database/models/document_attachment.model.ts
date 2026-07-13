import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'document_attachment',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class DocumentAttachmentModel extends Model {
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

  @Column({ type: DataType.STRING(240), field: 'file_store_key', allowNull: false })
  declare fileStoreKey: string;

  @Column({ type: DataType.STRING(100), field: 'mime_type', allowNull: true })
  declare mimeType: string | null;

  @Column({ type: DataType.STRING(64), field: 'sha256', allowNull: false })
  declare sha256: string;

  @Column({ type: DataType.UUID, field: 'uploaded_by', allowNull: true })
  declare uploadedBy: string | null;

  @Column({
    type: DataType.DATE,
    field: 'uploaded_at',
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare uploadedAt: Date;
}
