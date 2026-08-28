import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'document_audit_log',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class DocumentAuditLogModel extends Model {
  // `autoIncrement` faltaba, y sin él Sequelize incluye `id` en el INSERT y su propia
  // validación lo rechaza con «id cannot be null» antes de llegar a la base — donde la
  // columna SÍ tiene su secuencia (`document_audit_log_id_seq`) y habría funcionado sola.
  @Column({
    type: DataType.BIGINT,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    autoIncrement: true,
  })
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
