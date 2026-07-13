import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript';
import { InventoryPlacementModel } from './inventory-placement.model';
import { AdvertiserAccountModel } from './advertiser-account.model';
import { CampaignModel } from './campaign.model';
import { AdSetModel } from './ad-set.model';
import { AdModel } from './ad.model';
import { AdEventModel } from './ad-event.model';

@Table({
  tableName: 'ad_delivery_decisions',
  timestamps: true,
  createdAt: 'served_at',
  updatedAt: false,
})
export class DeliveryDecisionModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;
  @Column({ field: 'request_id', type: DataType.UUID, allowNull: false }) declare requestId: string;
  @ForeignKey(() => InventoryPlacementModel)
  @Column({ field: 'placement_id', type: DataType.UUID, allowNull: false })
  declare placementId: string;
  @ForeignKey(() => AdvertiserAccountModel)
  @Column({ field: 'advertiser_id', type: DataType.UUID, allowNull: false })
  declare advertiserId: string;
  @ForeignKey(() => CampaignModel)
  @Column({ field: 'campaign_id', type: DataType.UUID, allowNull: false })
  declare campaignId: string;
  @ForeignKey(() => AdSetModel)
  @Column({ field: 'ad_set_id', type: DataType.UUID, allowNull: false })
  declare adSetId: string;
  @ForeignKey(() => AdModel)
  @Column({ field: 'ad_id', type: DataType.UUID, allowNull: false })
  declare adId: string;
  @Column({ field: 'corporate_client_hash', type: DataType.STRING(128), allowNull: true })
  declare corporateClientHash: string | null;
  @Column({ field: 'context_hash', type: DataType.STRING(128), allowNull: true })
  declare contextHash: string | null;
  @Column({ field: 'auction_rank', type: DataType.DECIMAL(12, 4), allowNull: true })
  declare auctionRank: string | null;
  @Column({ field: 'price_micros', type: DataType.BIGINT, allowNull: false, defaultValue: 0 })
  declare priceMicros: number;
  @BelongsTo(() => InventoryPlacementModel, 'placement_id')
  declare placement?: InventoryPlacementModel;
  @BelongsTo(() => AdvertiserAccountModel, 'advertiser_id')
  declare advertiser?: AdvertiserAccountModel;
  @BelongsTo(() => CampaignModel, 'campaign_id') declare campaign?: CampaignModel;
  @BelongsTo(() => AdSetModel, 'ad_set_id') declare adSet?: AdSetModel;
  @BelongsTo(() => AdModel, 'ad_id') declare ad?: AdModel;
  @HasMany(() => AdEventModel, 'delivery_decision_id') declare events?: AdEventModel[];
}
