import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'journal_entry_entity_link',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class JournalEntryEntityLinkModel extends Model {
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

  @Column({ type: DataType.STRING(40), field: 'entity_type', allowNull: false })
  declare entityType: string;

  @Column({ type: DataType.UUID, field: 'entity_id', allowNull: false })
  declare entityId: string;

  @Column({
    type: DataType.STRING(40),
    field: 'relation',
    allowNull: false,
    defaultValue: 'DEFAULT',
  })
  declare relation: string;

  @Column({ type: DataType.JSONB, field: 'metadata', allowNull: false, defaultValue: {} })
  declare metadata: Record<string, unknown>;

  @Column({ type: DataType.UUID, field: 'created_by', allowNull: true })
  declare createdBy: string | null;

  @Column({
    type: DataType.DATE,
    field: 'created_at',
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare createdAt: Date;
}
