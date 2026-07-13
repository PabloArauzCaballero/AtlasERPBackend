import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { AdvertiserAccountModel } from './advertiser-account.model';
import { CampaignModel } from './campaign.model';
import { AdEventModel } from './ad-event.model';

@Table({
  tableName: 'ad_spend_ledger',
  timestamps: true,
  createdAt: 'occurred_at',
  updatedAt: false,
})
export class SpendLedgerModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;
  @ForeignKey(() => AdvertiserAccountModel)
  @Column({ field: 'advertiser_id', type: DataType.UUID, allowNull: false })
  declare advertiserId: string;
  @ForeignKey(() => CampaignModel)
  @Column({ field: 'campaign_id', type: DataType.UUID, allowNull: true })
  declare campaignId: string | null;
  @ForeignKey(() => AdEventModel)
  @Column({ field: 'ad_event_id', type: DataType.UUID, allowNull: true })
  declare adEventId: string | null;
  @Column({ field: 'entry_type', type: DataType.STRING(30), allowNull: false })
  declare entryType: string;
  @Column({ field: 'amount_micros', type: DataType.BIGINT, allowNull: false })
  declare amountMicros: number;
  @Column({ type: DataType.CHAR(3), allowNull: false, defaultValue: 'BOB' })
  declare currency: string;
  @Column({ type: DataType.STRING(120), allowNull: true }) declare reason: string | null;
  @Column({ field: 'created_by', type: DataType.UUID, allowNull: true }) declare createdBy:
    string | null;
  @BelongsTo(() => AdvertiserAccountModel, 'advertiser_id')
  declare advertiser?: AdvertiserAccountModel;
  @BelongsTo(() => CampaignModel, 'campaign_id') declare campaign?: CampaignModel;
  @BelongsTo(() => AdEventModel, 'ad_event_id') declare adEvent?: AdEventModel;
}
