import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { AdvertiserAccountModel } from './advertiser-account.model';

@Table({
  tableName: 'ad_billing_profiles',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
})
export class BillingProfileModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;
  @ForeignKey(() => AdvertiserAccountModel)
  @Column({ field: 'advertiser_id', type: DataType.UUID, allowNull: false })
  declare advertiserId: string;
  @Column({ field: 'fiscal_name', type: DataType.STRING(180), allowNull: false })
  declare fiscalName: string;
  @Column({ field: 'tax_id', type: DataType.STRING(40), allowNull: false }) declare taxId: string;
  @Column({ field: 'billing_email', type: DataType.STRING(180), allowNull: false })
  declare billingEmail: string;
  @Column({ field: 'address_line', type: DataType.TEXT, allowNull: true }) declare addressLine:
    string | null;
  @Column({ field: 'country_code', type: DataType.CHAR(2), allowNull: false, defaultValue: 'BO' })
  declare countryCode: string;
  @Column({ type: DataType.STRING(80), allowNull: true }) declare city: string | null;
  @Column({ field: 'tax_regime', type: DataType.STRING(80), allowNull: true }) declare taxRegime:
    string | null;
  @Column({ field: 'sin_customer_code', type: DataType.STRING(80), allowNull: true })
  declare sinCustomerCode: string | null;
  @Column({ field: 'is_default', type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare isDefault: boolean;
  @Column({ type: DataType.STRING(30), allowNull: false, defaultValue: 'ACTIVE' })
  declare status: string;
  @BelongsTo(() => AdvertiserAccountModel, 'advertiser_id')
  declare advertiser?: AdvertiserAccountModel;
}
