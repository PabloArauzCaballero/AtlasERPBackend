import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'ad_daily_metrics',
  timestamps: true,
  createdAt: false,
  updatedAt: 'updated_at',
})
export class DailyMetricModel extends Model {
  @Column({ field: 'metric_date', type: DataType.DATEONLY, primaryKey: true })
  declare metricDate: string;
  @Column({ field: 'advertiser_id', type: DataType.UUID, primaryKey: true })
  declare advertiserId: string;
  @Column({ field: 'campaign_id', type: DataType.UUID, primaryKey: true, allowNull: true })
  declare campaignId: string | null;
  @Column({ field: 'ad_set_id', type: DataType.UUID, primaryKey: true, allowNull: true })
  declare adSetId: string | null;
  @Column({ field: 'ad_id', type: DataType.UUID, primaryKey: true, allowNull: true }) declare adId:
    string | null;
  @Column({ field: 'placement_id', type: DataType.UUID, primaryKey: true, allowNull: true })
  declare placementId: string | null;
  @Column({ type: DataType.BIGINT, allowNull: false, defaultValue: 0 }) declare impressions: number;
  @Column({ type: DataType.BIGINT, allowNull: false, defaultValue: 0 }) declare clicks: number;
  @Column({ type: DataType.BIGINT, allowNull: false, defaultValue: 0 }) declare conversions: number;
  @Column({ field: 'billable_events', type: DataType.BIGINT, allowNull: false, defaultValue: 0 })
  declare billableEvents: number;
  @Column({ field: 'spend_micros', type: DataType.BIGINT, allowNull: false, defaultValue: 0 })
  declare spendMicros: number;
}
