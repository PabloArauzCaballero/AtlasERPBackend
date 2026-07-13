import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'legal_entity',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class LegalEntityModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.STRING(20), field: 'code', allowNull: false })
  declare code: string;

  @Column({ type: DataType.STRING(200), field: 'legal_name', allowNull: false })
  declare legalName: string;

  @Column({ type: DataType.STRING(40), field: 'tax_id', allowNull: true })
  declare taxId: string | null;

  @Column({ type: DataType.CHAR(2), field: 'country_code', allowNull: false, defaultValue: 'BO' })
  declare countryCode: string;

  @Column({ type: DataType.CHAR(3), field: 'base_currency', allowNull: false, defaultValue: 'BOB' })
  declare baseCurrency: string;

  @Column({
    type: DataType.STRING(50),
    field: 'timezone',
    allowNull: false,
    defaultValue: 'America/La_Paz',
  })
  declare timezone: string;

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
