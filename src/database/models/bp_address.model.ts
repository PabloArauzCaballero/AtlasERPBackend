import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'bp_address',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class BpAddressModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.UUID, field: 'business_partner_id', allowNull: false })
  declare businessPartnerId: string;

  @Column({ type: DataType.STRING(20), field: 'address_type', allowNull: false })
  declare addressType: string;

  @Column({ type: DataType.CHAR(2), field: 'country_code', allowNull: false, defaultValue: 'BO' })
  declare countryCode: string;

  @Column({ type: DataType.STRING(80), field: 'city', allowNull: true })
  declare city: string | null;

  @Column({ type: DataType.STRING(200), field: 'line1', allowNull: true })
  declare line1: string | null;

  @Column({ type: DataType.STRING(200), field: 'line2', allowNull: true })
  declare line2: string | null;

  @Column({ type: DataType.BOOLEAN, field: 'is_primary', allowNull: false, defaultValue: false })
  declare isPrimary: boolean;
}
