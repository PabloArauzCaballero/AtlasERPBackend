import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript';
import { AdSetModel } from './ad-set.model';
import { CreativeModel } from './creative.model';
import { ModerationReviewModel } from './moderation-review.model';
import { DeliveryDecisionModel } from './delivery-decision.model';

@Table({ tableName: 'ad_ads', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' })
export class AdModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;
  @ForeignKey(() => AdSetModel)
  @Column({ field: 'ad_set_id', type: DataType.UUID, allowNull: false })
  declare adSetId: string;
  @ForeignKey(() => CreativeModel)
  @Column({ field: 'creative_id', type: DataType.UUID, allowNull: false })
  declare creativeId: string;
  @Column({ type: DataType.STRING(140), allowNull: false }) declare name: string;
  @Column({ type: DataType.STRING(30), allowNull: false, defaultValue: 'DRAFT' })
  declare status: string;
  @Column({
    field: 'approval_status',
    type: DataType.STRING(30),
    allowNull: false,
    defaultValue: 'NOT_SUBMITTED',
  })
  declare approvalStatus: string;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 }) declare weight: number;
  @Column({ field: 'tracking_template', type: DataType.TEXT, allowNull: true })
  declare trackingTemplate: string | null;
  @BelongsTo(() => AdSetModel, 'ad_set_id') declare adSet?: AdSetModel;
  @BelongsTo(() => CreativeModel, 'creative_id') declare creative?: CreativeModel;
  @HasMany(() => ModerationReviewModel, 'ad_id')
  declare moderationReviews?: ModerationReviewModel[];
  @HasMany(() => DeliveryDecisionModel, 'ad_id')
  declare deliveryDecisions?: DeliveryDecisionModel[];
}
