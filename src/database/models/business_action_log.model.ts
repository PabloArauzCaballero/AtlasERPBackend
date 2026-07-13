import { Column, DataType, Model, Table } from 'sequelize-typescript';

export type BusinessActionLogStatus = 'SUCCESS' | 'FAILED' | 'PARTIAL';

@Table({
  schema: 'atlas_audit',
  tableName: 'business_action_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  underscored: true,
  indexes: [
    { fields: ['module_code', 'created_at'] },
    { fields: ['business_process', 'created_at'] },
    { fields: ['aggregate_type', 'aggregate_id'] },
    { fields: ['correlation_id'] },
    { fields: ['actor_user_id', 'created_at'] },
  ],
})
export class BusinessActionLogModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @Column({ field: 'module_code', type: DataType.STRING(80), allowNull: false })
  declare moduleCode: string;

  @Column({ field: 'business_process', type: DataType.STRING(120), allowNull: false })
  declare businessProcess: string;

  @Column({ field: 'action_code', type: DataType.STRING(120), allowNull: false })
  declare actionCode: string;

  @Column({ field: 'actor_user_id', type: DataType.UUID, allowNull: true })
  declare actorUserId: string | null;

  @Column({ field: 'actor_role', type: DataType.STRING(120), allowNull: true })
  declare actorRole: string | null;

  @Column({ field: 'aggregate_type', type: DataType.STRING(120), allowNull: true })
  declare aggregateType: string | null;

  @Column({ field: 'aggregate_id', type: DataType.STRING(120), allowNull: true })
  declare aggregateId: string | null;

  @Column({ field: 'correlation_id', type: DataType.STRING(160), allowNull: true })
  declare correlationId: string | null;

  @Column({ field: 'request_id', type: DataType.STRING(160), allowNull: true })
  declare requestId: string | null;

  @Column({
    field: 'source_system',
    type: DataType.STRING(80),
    allowNull: false,
    defaultValue: 'ATLAS',
  })
  declare sourceSystem: string;

  @Column({
    field: 'affected_tables',
    type: DataType.ARRAY(DataType.STRING(120)),
    allowNull: false,
  })
  declare affectedTables: string[];

  @Column({ field: 'affected_record_count', type: DataType.INTEGER, allowNull: false })
  declare affectedRecordCount: number;

  @Column({ type: DataType.ENUM('SUCCESS', 'FAILED', 'PARTIAL'), allowNull: false })
  declare status: BusinessActionLogStatus;

  @Column({ field: 'input_summary', type: DataType.JSONB, allowNull: true })
  declare inputSummary: Record<string, unknown> | null;

  @Column({ field: 'output_summary', type: DataType.JSONB, allowNull: true })
  declare outputSummary: Record<string, unknown> | null;

  @Column({ field: 'error_code', type: DataType.STRING(120), allowNull: true })
  declare errorCode: string | null;

  @Column({ field: 'error_message', type: DataType.TEXT, allowNull: true })
  declare errorMessage: string | null;

  @Column({
    field: 'created_at',
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare createdAt: Date;
}
