import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript';
import { AdvertiserAccountModel } from './advertiser-account.model';
import { BillingProfileModel } from './billing-profile.model';
import { InvoiceLineModel } from './invoice-line.model';
import { PaymentModel } from './payment.model';

@Table({ tableName: 'ad_invoices', timestamps: true, createdAt: 'created_at', updatedAt: false })
export class InvoiceModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;
  @ForeignKey(() => AdvertiserAccountModel)
  @Column({ field: 'advertiser_id', type: DataType.UUID, allowNull: false })
  declare advertiserId: string;
  @ForeignKey(() => BillingProfileModel)
  @Column({ field: 'billing_profile_id', type: DataType.UUID, allowNull: false })
  declare billingProfileId: string;
  @Column({ field: 'invoice_number', type: DataType.STRING(80), allowNull: true, unique: true })
  declare invoiceNumber: string | null;
  @Column({ field: 'period_start', type: DataType.DATEONLY, allowNull: false })
  declare periodStart: string;
  @Column({ field: 'period_end', type: DataType.DATEONLY, allowNull: false })
  declare periodEnd: string;
  @Column({ type: DataType.CHAR(3), allowNull: false, defaultValue: 'BOB' })
  declare currency: string;
  @Column({ field: 'subtotal_micros', type: DataType.BIGINT, allowNull: false, defaultValue: 0 })
  declare subtotalMicros: number;
  @Column({ field: 'tax_micros', type: DataType.BIGINT, allowNull: false, defaultValue: 0 })
  declare taxMicros: number;
  @Column({ field: 'total_micros', type: DataType.BIGINT, allowNull: false, defaultValue: 0 })
  declare totalMicros: number;
  @Column({ type: DataType.STRING(30), allowNull: false, defaultValue: 'DRAFT' })
  declare status: string;
  @Column({ field: 'sin_cuf', type: DataType.STRING(160), allowNull: true }) declare sinCuf:
    string | null;
  @Column({ field: 'issued_at', type: DataType.DATE, allowNull: true })
  declare issuedAt: Date | null;
  @Column({ field: 'due_at', type: DataType.DATE, allowNull: true }) declare dueAt: Date | null;
  @BelongsTo(() => AdvertiserAccountModel, 'advertiser_id')
  declare advertiser?: AdvertiserAccountModel;
  @BelongsTo(() => BillingProfileModel, 'billing_profile_id')
  declare billingProfile?: BillingProfileModel;
  @HasMany(() => InvoiceLineModel, 'invoice_id') declare lines?: InvoiceLineModel[];
  @HasMany(() => PaymentModel, 'invoice_id') declare payments?: PaymentModel[];
}
