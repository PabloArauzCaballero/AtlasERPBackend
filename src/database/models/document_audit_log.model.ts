import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'document_audit_log',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class DocumentAuditLogModel extends Model {
  @Column({ type: DataType.BIGINT, field: 'id', allowNull: false, primaryKey: true })
  declare id: number;

  @Column({ type: DataType.UUID, field: 'accounting_document_id', allowNull: true })
  declare accountingDocumentId: string | null;

  @Column({ type: DataType.STRING(40), field: 'event_type', allowNull: false })
  declare eventType: string;

  @Column({ type: DataType.JSONB, field: 'event_payload', allowNull: false })
  declare eventPayload: Record<string, unknown>;

  @Column({ type: DataType.UUID, field: 'actor_id', allowNull: true })
  declare actorId: string | null;

  @Column({
    type: DataType.DATE,
    field: 'created_at',
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare createdAt: Date;
}
