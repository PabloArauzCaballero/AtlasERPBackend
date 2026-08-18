import { Column, DataType, HasMany, Model, Table } from 'sequelize-typescript';
import { CampaignModel } from './campaign.model';
import { BillingProfileModel } from './billing-profile.model';
import { ContractModel } from './contract.model';
import { AdvertiserUserModel } from './advertiser-user.model';

@Table({
  tableName: 'ad_advertiser_accounts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
})
export class AdvertiserAccountModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;
  @Column({ field: 'legal_name', type: DataType.STRING(180), allowNull: false })
  declare legalName: string;
  @Column({ field: 'trade_name', type: DataType.STRING(120), allowNull: false })
  declare tradeName: string;
  @Column({ field: 'tax_id', type: DataType.STRING(40), allowNull: false }) declare taxId: string;
  @Column({ field: 'country_code', type: DataType.CHAR(2), allowNull: false, defaultValue: 'BO' })
  declare countryCode: string;
  @Column({ type: DataType.STRING(80), allowNull: true }) declare city: string | null;
  @Column({ field: 'business_category', type: DataType.STRING(80), allowNull: true })
  declare businessCategory: string | null;
  @Column({ field: 'website_url', type: DataType.TEXT, allowNull: true }) declare websiteUrl:
    string | null;
  @Column({ field: 'primary_contact_name', type: DataType.STRING(140), allowNull: true })
  declare primaryContactName: string | null;
  @Column({ field: 'primary_contact_email', type: DataType.STRING(180), allowNull: true })
  declare primaryContactEmail: string | null;
  @Column({ type: DataType.STRING(30), allowNull: false, defaultValue: 'PENDING_REVIEW' })
  declare status: string;
  @Column({
    field: 'billing_mode',
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: 'POSTPAID',
  })
  declare billingMode: string;
  @Column({ type: DataType.CHAR(3), allowNull: false, defaultValue: 'BOB' })
  declare currency: string;
  @Column({
    field: 'credit_limit_micros',
    type: DataType.BIGINT,
    allowNull: false,
    defaultValue: 0,
  })
  declare creditLimitMicros: number;
  @Column({
    field: 'risk_status',
    type: DataType.STRING(30),
    allowNull: false,
    defaultValue: 'NORMAL',
  })
  declare riskStatus: string;
  @Column({ field: 'created_by', type: DataType.UUID, allowNull: true }) declare createdBy:
    string | null;
  /**
   * Cuenta B2B del ERP (`atlas_sales.b2b_accounts`) dueña de este anunciante. Es el eje de
   * autorización del portal del comercio: sin este enlace el anunciante no es visible ni
   * operable desde `/portal/*` (fail-closed).
   */
  @Column({ field: 'merchant_account_id', type: DataType.UUID, allowNull: true })
  declare merchantAccountId: string | null;

  @HasMany(() => CampaignModel, 'advertiser_id') declare campaigns?: CampaignModel[];
  @HasMany(() => BillingProfileModel, 'advertiser_id')
  declare billingProfiles?: BillingProfileModel[];
  @HasMany(() => ContractModel, 'advertiser_id') declare contracts?: ContractModel[];
  @HasMany(() => AdvertiserUserModel, 'advertiser_id')
  declare advertiserUsers?: AdvertiserUserModel[];
}
