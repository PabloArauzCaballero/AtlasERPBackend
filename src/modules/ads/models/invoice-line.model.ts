import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { InvoiceModel } from './invoice.model';
import { CampaignModel } from './campaign.model';

@Table({ tableName: 'ad_invoice_lines', timestamps: false })
export class InvoiceLineModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;
  @ForeignKey(() => InvoiceModel)
  @Column({ field: 'invoice_id', type: DataType.UUID, allowNull: false })
  declare invoiceId: string;
  @ForeignKey(() => CampaignModel)
  @Column({ field: 'campaign_id', type: DataType.UUID, allowNull: true })
  declare campaignId: string | null;
  @Column({ type: DataType.TEXT, allowNull: false }) declare description: string;
  @Column({ field: 'pricing_model', type: DataType.STRING(20), allowNull: false })
  declare pricingModel: string;
  @Column({ type: DataType.DECIMAL(18, 4), allowNull: false }) declare quantity: string;
  @Column({ field: 'unit_price_micros', type: DataType.BIGINT, allowNull: false })
  declare unitPriceMicros: number;
  @Column({ field: 'amount_micros', type: DataType.BIGINT, allowNull: false })
  declare amountMicros: number;
  @BelongsTo(() => InvoiceModel, 'invoice_id') declare invoice?: InvoiceModel;
  @BelongsTo(() => CampaignModel, 'campaign_id') declare campaign?: CampaignModel;
}
