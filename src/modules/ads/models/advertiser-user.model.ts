import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { AdvertiserAccountModel } from './advertiser-account.model';

@Table({
  tableName: 'ad_advertiser_users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
})
export class AdvertiserUserModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;
  @ForeignKey(() => AdvertiserAccountModel)
  @Column({ field: 'advertiser_id', type: DataType.UUID, allowNull: false })
  declare advertiserId: string;
  // Texto y no UUID: el `sub` del proveedor de identidad es opaco (AtlasBackend emite bigints).
  @Column({ field: 'user_id', type: DataType.STRING(64), allowNull: true }) declare userId: string | null;
  @Column({ type: DataType.STRING(180), allowNull: false }) declare email: string;
  @Column({ type: DataType.STRING(30), allowNull: false }) declare role: string;
  @Column({ type: DataType.STRING(30), allowNull: false, defaultValue: 'ACTIVE' })
  declare status: string;
  @Column({ field: 'invited_by', type: DataType.UUID, allowNull: true }) declare invitedBy:
    string | null;
  @BelongsTo(() => AdvertiserAccountModel, 'advertiser_id')
  declare advertiser?: AdvertiserAccountModel;
}
