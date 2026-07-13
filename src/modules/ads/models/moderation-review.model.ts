import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { AdvertiserAccountModel } from './advertiser-account.model';
import { CampaignModel } from './campaign.model';
import { AdModel } from './ad.model';
import { CreativeModel } from './creative.model';

@Table({
  tableName: 'ad_moderation_reviews',
  timestamps: true,
  createdAt: 'reviewed_at',
  updatedAt: false,
})
export class ModerationReviewModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;
  @ForeignKey(() => AdvertiserAccountModel)
  @Column({ field: 'advertiser_id', type: DataType.UUID, allowNull: false })
  declare advertiserId: string;
  @ForeignKey(() => CampaignModel)
  @Column({ field: 'campaign_id', type: DataType.UUID, allowNull: true })
  declare campaignId: string | null;
  @ForeignKey(() => AdModel)
  @Column({ field: 'ad_id', type: DataType.UUID, allowNull: true })
  declare adId: string | null;
  @ForeignKey(() => CreativeModel)
  @Column({ field: 'creative_id', type: DataType.UUID, allowNull: true })
  declare creativeId: string | null;
  @Column({ field: 'reviewer_user_id', type: DataType.UUID, allowNull: true })
  declare reviewerUserId: string | null;
  @Column({ type: DataType.STRING(30), allowNull: false, defaultValue: 'PENDING_REVIEW' })
  declare decision: string;
  @Column({ field: 'reason_code', type: DataType.STRING(80), allowNull: true }) declare reasonCode:
    string | null;
  @Column({ type: DataType.TEXT, allowNull: true }) declare notes: string | null;
  @Column({
    field: 'requires_advertiser_changes',
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  declare requiresAdvertiserChanges: boolean;
  @BelongsTo(() => AdvertiserAccountModel, 'advertiser_id')
  declare advertiser?: AdvertiserAccountModel;
  @BelongsTo(() => CampaignModel, 'campaign_id') declare campaign?: CampaignModel;
  @BelongsTo(() => AdModel, 'ad_id') declare ad?: AdModel;
  @BelongsTo(() => CreativeModel, 'creative_id') declare creative?: CreativeModel;
}
