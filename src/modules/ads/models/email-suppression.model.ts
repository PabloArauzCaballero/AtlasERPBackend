import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'ad_email_suppressions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
})
export class EmailSuppressionModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;
  @Column({ field: 'email_normalized', type: DataType.STRING(255), allowNull: false, unique: true })
  declare emailNormalized: string;
  @Column({ type: DataType.STRING(40), allowNull: false }) declare reason: string;
  @Column({ type: DataType.TEXT }) declare details: string | null;
  @Column({ field: 'is_active', type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare isActive: boolean;
}
