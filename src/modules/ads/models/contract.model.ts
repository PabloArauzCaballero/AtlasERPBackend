import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { AdvertiserAccountModel } from './advertiser-account.model';

@Table({ tableName: 'ad_contracts', timestamps: true, createdAt: 'created_at', updatedAt: false })
export class ContractModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;
  @ForeignKey(() => AdvertiserAccountModel)
  @Column({ field: 'advertiser_id', type: DataType.UUID, allowNull: false })
  declare advertiserId: string;
  @Column({ field: 'contract_number', type: DataType.STRING(80), allowNull: false })
  declare contractNumber: string;
  @Column({
    field: 'contract_type',
    type: DataType.STRING(40),
    allowNull: false,
    defaultValue: 'STANDARD_ADS',
  })
  declare contractType: string;
  @Column({ field: 'pricing_terms', type: DataType.JSONB, allowNull: false, defaultValue: {} })
  declare pricingTerms: Record<string, unknown>;
  @Column({ field: 'start_date', type: DataType.DATEONLY, allowNull: false })
  declare startDate: string;
  @Column({ field: 'end_date', type: DataType.DATEONLY, allowNull: true }) declare endDate:
    string | null;
  @Column({ type: DataType.STRING(30), allowNull: false, defaultValue: 'DRAFT' })
  declare status: string;
  @Column({ field: 'approved_by', type: DataType.UUID, allowNull: true }) declare approvedBy:
    string | null;
  @Column({ field: 'signed_at', type: DataType.DATE, allowNull: true })
  declare signedAt: Date | null;
  @BelongsTo(() => AdvertiserAccountModel, 'advertiser_id')
  declare advertiser?: AdvertiserAccountModel;
}
