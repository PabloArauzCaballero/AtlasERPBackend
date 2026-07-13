import {
  BelongsTo,
  BelongsToMany,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { AdvertiserAccountModel } from './advertiser-account.model';
import { CreativeModel } from './creative.model';
import { CreativeAssetModel } from './creative-asset.model';

@Table({ tableName: 'ad_assets', timestamps: true, createdAt: 'created_at', updatedAt: false })
export class AssetModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;
  @ForeignKey(() => AdvertiserAccountModel)
  @Column({ field: 'advertiser_id', type: DataType.UUID, allowNull: false })
  declare advertiserId: string;
  @Column({ field: 'file_url', type: DataType.TEXT, allowNull: false }) declare fileUrl: string;
  @Column({ field: 'storage_key', type: DataType.TEXT, allowNull: false })
  declare storageKey: string;
  @Column({ field: 'file_hash', type: DataType.STRING(128), allowNull: false })
  declare fileHash: string;
  @Column({ field: 'mime_type', type: DataType.STRING(80), allowNull: false })
  declare mimeType: string;
  @Column({ field: 'width_px', type: DataType.INTEGER, allowNull: true }) declare widthPx:
    number | null;
  @Column({ field: 'height_px', type: DataType.INTEGER, allowNull: true }) declare heightPx:
    number | null;
  @Column({ field: 'duration_seconds', type: DataType.DECIMAL(10, 2), allowNull: true })
  declare durationSeconds: string | null;
  @Column({ field: 'size_bytes', type: DataType.BIGINT, allowNull: false })
  declare sizeBytes: number;
  @BelongsTo(() => AdvertiserAccountModel, 'advertiser_id')
  declare advertiser?: AdvertiserAccountModel;
  @BelongsToMany(() => CreativeModel, () => CreativeAssetModel) declare creatives?: CreativeModel[];
}
