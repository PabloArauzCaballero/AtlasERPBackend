import {
  BelongsTo,
  BelongsToMany,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript';
import { AdvertiserAccountModel } from './advertiser-account.model';
import { AssetModel } from './asset.model';
import { CreativeAssetModel } from './creative-asset.model';
import { AdModel } from './ad.model';

@Table({
  tableName: 'ad_creatives',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
})
export class CreativeModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;
  @ForeignKey(() => AdvertiserAccountModel)
  @Column({ field: 'advertiser_id', type: DataType.UUID, allowNull: false })
  declare advertiserId: string;
  @Column({ type: DataType.STRING(140), allowNull: false }) declare name: string;
  @Column({ field: 'creative_type', type: DataType.STRING(30), allowNull: false })
  declare creativeType: string;
  @Column({ type: DataType.STRING(160), allowNull: true }) declare headline: string | null;
  @Column({ field: 'body_text', type: DataType.TEXT, allowNull: true }) declare bodyText:
    string | null;
  @Column({ field: 'cta_text', type: DataType.STRING(60), allowNull: true }) declare ctaText:
    string | null;
  @Column({ field: 'destination_url', type: DataType.TEXT, allowNull: false })
  declare destinationUrl: string;
  @Column({ type: DataType.STRING(30), allowNull: false, defaultValue: 'DRAFT' })
  declare status: string;
  @Column({
    field: 'policy_review_status',
    type: DataType.STRING(30),
    allowNull: false,
    defaultValue: 'NOT_SUBMITTED',
  })
  declare policyReviewStatus: string;
  @Column({ field: 'created_by', type: DataType.UUID, allowNull: true }) declare createdBy:
    string | null;
  @BelongsTo(() => AdvertiserAccountModel, 'advertiser_id')
  declare advertiser?: AdvertiserAccountModel;
  @BelongsToMany(() => AssetModel, () => CreativeAssetModel) declare assets?: AssetModel[];
  @HasMany(() => AdModel, 'creative_id') declare ads?: AdModel[];
}
