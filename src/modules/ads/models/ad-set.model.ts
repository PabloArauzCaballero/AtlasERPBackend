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
import { CampaignModel } from './campaign.model';
import { TargetSegmentModel } from './target-segment.model';
import { AdModel } from './ad.model';
import { InventoryPlacementModel } from './inventory-placement.model';
import { AdSetPlacementModel } from './ad-set-placement.model';

@Table({
  tableName: 'ad_ad_sets',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
})
export class AdSetModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;
  @ForeignKey(() => CampaignModel)
  @Column({ field: 'campaign_id', type: DataType.UUID, allowNull: false })
  declare campaignId: string;
  @ForeignKey(() => TargetSegmentModel)
  @Column({ field: 'target_segment_id', type: DataType.UUID, allowNull: true })
  declare targetSegmentId: string | null;
  @Column({ type: DataType.STRING(140), allowNull: false }) declare name: string;
  @Column({ type: DataType.STRING(30), allowNull: false, defaultValue: 'DRAFT' })
  declare status: string;
  @Column({ field: 'buying_model', type: DataType.STRING(20), allowNull: false })
  declare buyingModel: string;
  @Column({ field: 'bid_amount_micros', type: DataType.BIGINT, allowNull: false })
  declare bidAmountMicros: number;
  @Column({ field: 'daily_budget_micros', type: DataType.BIGINT, allowNull: true })
  declare dailyBudgetMicros: number | null;
  @Column({
    field: 'pacing_strategy',
    type: DataType.STRING(30),
    allowNull: false,
    defaultValue: 'EVEN',
  })
  declare pacingStrategy: string;
  @Column({ field: 'frequency_cap_count', type: DataType.INTEGER, allowNull: true })
  declare frequencyCapCount: number | null;
  @Column({ field: 'frequency_cap_window_hours', type: DataType.INTEGER, allowNull: true })
  declare frequencyCapWindowHours: number | null;
  @Column({
    field: 'target_definition_json',
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: {},
  })
  declare targetDefinitionJson: Record<string, unknown>;
  @Column({ field: 'starts_at', type: DataType.DATE, allowNull: true })
  declare startsAt: Date | null;
  @Column({ field: 'ends_at', type: DataType.DATE, allowNull: true }) declare endsAt: Date | null;
  @BelongsTo(() => CampaignModel, 'campaign_id') declare campaign?: CampaignModel;
  @BelongsTo(() => TargetSegmentModel, 'target_segment_id')
  declare targetSegment?: TargetSegmentModel;
  @HasMany(() => AdModel, 'ad_set_id') declare ads?: AdModel[];
  @BelongsToMany(() => InventoryPlacementModel, () => AdSetPlacementModel)
  declare placements?: InventoryPlacementModel[];
}
