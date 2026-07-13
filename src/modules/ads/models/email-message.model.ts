import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'ad_email_messages',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
})
export class EmailMessageModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;
  @Column({ field: 'tracking_id', type: DataType.UUID, allowNull: false })
  declare trackingId: string;
  @Column({ field: 'campaign_id', type: DataType.UUID, allowNull: false })
  declare campaignId: string;
  @Column({ field: 'recipient_email', type: DataType.STRING(255), allowNull: false })
  declare recipientEmail: string;
  @Column({ field: 'recipient_reference', type: DataType.STRING(120) }) declare recipientReference:
    string | null;
  @Column({ type: DataType.STRING(500), allowNull: false }) declare subject: string;
  @Column({ field: 'html_body', type: DataType.TEXT, allowNull: false }) declare htmlBody: string;
  @Column({ field: 'text_body', type: DataType.TEXT }) declare textBody: string | null;
  @Column({ type: DataType.STRING(30), allowNull: false, defaultValue: 'PENDING' })
  declare status: string;
  @Column({ field: 'scheduled_at', type: DataType.DATE, allowNull: false })
  declare scheduledAt: Date;
  @Column({ field: 'provider_message_id', type: DataType.STRING(180) }) declare providerMessageId:
    string | null;
  @Column({ field: 'attempt_count', type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare attemptCount: number;
  @Column({ field: 'last_error', type: DataType.TEXT }) declare lastError: string | null;
  @Column({ field: 'sent_at', type: DataType.DATE }) declare sentAt: Date | null;
}
