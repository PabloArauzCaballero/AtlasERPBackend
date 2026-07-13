import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'business_partner_role',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class BusinessPartnerRoleModel extends Model {
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

  @Column({ type: DataType.UUID, field: 'legal_entity_id', allowNull: true })
  declare legalEntityId: string | null;

  @Column({ type: DataType.STRING(30), field: 'role_code', allowNull: false })
  declare roleCode: string;

  @Column({
    type: DataType.DATEONLY,
    field: 'effective_from',
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare effectiveFrom: Date | string;

  @Column({ type: DataType.DATEONLY, field: 'effective_to', allowNull: true })
  declare effectiveTo: Date | string | null;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false, defaultValue: 'ACTIVE' })
  declare status: string;
}
