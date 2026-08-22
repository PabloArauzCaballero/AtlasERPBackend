import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'erp_file',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class ErpFileModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.STRING(40), field: 'owner_type', allowNull: false })
  declare ownerType: string;

  @Column({ type: DataType.UUID, field: 'owner_id', allowNull: false })
  declare ownerId: string;

  @Column({ type: DataType.STRING(240), field: 'file_name', allowNull: false })
  declare fileName: string;

  @Column({ type: DataType.STRING(120), field: 'mime_type', allowNull: true })
  declare mimeType: string | null;

  @Column({ type: DataType.BIGINT, field: 'byte_size', allowNull: true })
  declare byteSize: number | null;

  @Column({
    type: DataType.STRING(30),
    field: 'storage_provider',
    allowNull: false,
    defaultValue: 'CLOUDINARY',
  })
  declare storageProvider: string;

  @Column({ type: DataType.STRING(300), field: 'storage_public_id', allowNull: false })
  declare storagePublicId: string;

  @Column({ type: DataType.STRING(600), field: 'secure_url', allowNull: false })
  declare secureUrl: string;

  @Column({ type: DataType.STRING(20), field: 'resource_type', allowNull: true })
  declare resourceType: string | null;

  @Column({ type: DataType.STRING(64), field: 'sha256', allowNull: true })
  declare sha256: string | null;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false, defaultValue: 'ACTIVE' })
  declare status: string;

  @Column({ type: DataType.UUID, field: 'uploaded_by', allowNull: true })
  declare uploadedBy: string | null;

  @Column({
    type: DataType.DATE,
    field: 'created_at',
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare createdAt: Date;
}
