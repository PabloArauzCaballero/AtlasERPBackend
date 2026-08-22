import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript';
import { AdvertiserAccountModel } from './advertiser-account.model';
import { AdSetModel } from './ad-set.model';
import { ModerationReviewModel } from './moderation-review.model';

@Table({
  tableName: 'ad_campaigns',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
})
export class CampaignModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;
  @ForeignKey(() => AdvertiserAccountModel)
  @Column({ field: 'advertiser_id', type: DataType.UUID, allowNull: false })
  declare advertiserId: string;
  @Column({ type: DataType.STRING(140), allowNull: false }) declare name: string;
  @Column({ type: DataType.STRING(40), allowNull: false }) declare objective: string;
  @Column({ type: DataType.STRING(30), allowNull: false, defaultValue: 'DRAFT' })
  declare status: string;
  @Column({
    field: 'approval_status',
    type: DataType.STRING(30),
    allowNull: false,
    defaultValue: 'NOT_SUBMITTED',
  })
  declare approvalStatus: string;
  @Column({ type: DataType.CHAR(3), allowNull: false, defaultValue: 'BOB' })
  declare currency: string;
  @Column({ field: 'budget_total_micros', type: DataType.BIGINT, allowNull: false })
  declare budgetTotalMicros: number;
  @Column({ field: 'budget_daily_micros', type: DataType.BIGINT, allowNull: true })
  declare budgetDailyMicros: number | null;
  @Column({ field: 'spend_total_micros', type: DataType.BIGINT, allowNull: false, defaultValue: 0 })
  declare spendTotalMicros: number;
  @Column({ field: 'starts_at', type: DataType.DATE, allowNull: false }) declare startsAt: Date;
  @Column({ field: 'ends_at', type: DataType.DATE, allowNull: true }) declare endsAt: Date | null;
  @Column({ field: 'created_by', type: DataType.STRING(64), allowNull: true }) declare createdBy:
    string | null;
  @BelongsTo(() => AdvertiserAccountModel, 'advertiser_id')
  declare advertiser?: AdvertiserAccountModel;
  @HasMany(() => AdSetModel, 'campaign_id') declare adSets?: AdSetModel[];
  @HasMany(() => ModerationReviewModel, 'campaign_id')
  declare moderationReviews?: ModerationReviewModel[];
}
