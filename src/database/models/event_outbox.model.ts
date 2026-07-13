import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'event_outbox',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class EventOutboxModel extends Model {
  @Column({ type: DataType.BIGINT, field: 'id', allowNull: false, primaryKey: true })
  declare id: number;

  @Column({ type: DataType.STRING(120), field: 'topic', allowNull: false })
  declare topic: string;

  @Column({ type: DataType.STRING(40), field: 'aggregate_type', allowNull: false })
  declare aggregateType: string;

  @Column({ type: DataType.UUID, field: 'aggregate_id', allowNull: false })
  declare aggregateId: string;

  @Column({ type: DataType.STRING(160), field: 'event_key', allowNull: false })
  declare eventKey: string;

  @Column({ type: DataType.JSONB, field: 'payload', allowNull: false })
  declare payload: Record<string, unknown>;

  @Column({ type: DataType.DATE, field: 'published_at', allowNull: true })
  declare publishedAt: Date | null;

  @Column({
    type: DataType.DATE,
    field: 'created_at',
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare createdAt: Date;
}
