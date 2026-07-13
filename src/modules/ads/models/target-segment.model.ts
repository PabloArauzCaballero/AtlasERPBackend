import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { AdvertiserAccountModel } from './advertiser-account.model';

@Table({
  tableName: 'ad_target_segments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
})
export class TargetSegmentModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;
  @ForeignKey(() => AdvertiserAccountModel)
  @Column({ field: 'advertiser_id', type: DataType.UUID, allowNull: true })
  declare advertiserId: string | null;
  @Column({ type: DataType.STRING(140), allowNull: false }) declare name: string;
  @Column({ field: 'segment_type', type: DataType.STRING(40), allowNull: false })
  declare segmentType: string;
  @Column({ field: 'definition_json', type: DataType.JSONB, allowNull: false })
  declare definitionJson: Record<string, unknown>;
  @Column({
    field: 'privacy_level',
    type: DataType.STRING(30),
    allowNull: false,
    defaultValue: 'CORPORATE_CONTEXTUAL',
  })
  declare privacyLevel: string;
  @Column({ type: DataType.STRING(30), allowNull: false, defaultValue: 'ACTIVE' })
  declare status: string;
  @BelongsTo(() => AdvertiserAccountModel, 'advertiser_id')
  declare advertiser?: AdvertiserAccountModel;
}
