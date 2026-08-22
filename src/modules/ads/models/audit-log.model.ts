import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  modelName: 'AdsAuditLogModel',
  tableName: 'ad_audit_log',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
})
export class AuditLogModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;
  @Column({ field: 'actor_user_id', type: DataType.STRING(64), allowNull: true })
  declare actorUserId: string | null;
  @Column({ field: 'actor_type', type: DataType.STRING(40), allowNull: false })
  declare actorType: string;
  @Column({ field: 'entity_type', type: DataType.STRING(80), allowNull: false })
  declare entityType: string;
  @Column({ field: 'entity_id', type: DataType.UUID, allowNull: false }) declare entityId: string;
  @Column({ type: DataType.STRING(80), allowNull: false }) declare action: string;
  @Column({ type: DataType.TEXT, allowNull: true }) declare reason: string | null;
  @Column({ type: DataType.STRING(20), allowNull: false, defaultValue: 'INFO' })
  declare severity: string;
  @Column({ field: 'before_json', type: DataType.JSONB, allowNull: true })
  declare beforeJson: Record<string, unknown> | null;
  @Column({ field: 'after_json', type: DataType.JSONB, allowNull: true }) declare afterJson: Record<
    string,
    unknown
  > | null;
  @Column({ field: 'request_id', type: DataType.UUID, allowNull: true }) declare requestId:
    string | null;
}
