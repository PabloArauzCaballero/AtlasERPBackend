import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'business_partner',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class BusinessPartnerModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.STRING(30), field: 'partner_no', allowNull: false })
  declare partnerNo: string;

  @Column({ type: DataType.STRING(20), field: 'partner_type', allowNull: false })
  declare partnerType: string;

  @Column({ type: DataType.STRING(200), field: 'legal_name', allowNull: false })
  declare legalName: string;

  @Column({ type: DataType.STRING(160), field: 'trade_name', allowNull: true })
  declare tradeName: string | null;

  @Column({ type: DataType.STRING(40), field: 'tax_id', allowNull: true })
  declare taxId: string | null;

  @Column({ type: DataType.CHAR(2), field: 'country_code', allowNull: false, defaultValue: 'BO' })
  declare countryCode: string;

  @Column({ type: DataType.STRING(20), field: 'kyb_status', allowNull: false })
  declare kybStatus: string;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false, defaultValue: 'ACTIVE' })
  declare status: string;

  @Column({
    type: DataType.DATE,
    field: 'created_at',
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare createdAt: Date;

  @Column({
    type: DataType.DATE,
    field: 'updated_at',
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare updatedAt: Date;
}
