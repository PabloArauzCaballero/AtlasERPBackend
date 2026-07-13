import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'equity_movement',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class EquityMovementModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.UUID, field: 'legal_entity_id', allowNull: false })
  declare legalEntityId: string;

  @Column({ type: DataType.UUID, field: 'shareholder_bp_id', allowNull: true })
  declare shareholderBpId: string | null;

  @Column({ type: DataType.STRING(30), field: 'movement_type', allowNull: false })
  declare movementType: string;

  @Column({ type: DataType.DATEONLY, field: 'movement_date', allowNull: false })
  declare movementDate: Date | string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'amount', allowNull: false })
  declare amount: number | string;

  @Column({ type: DataType.CHAR(3), field: 'currency_code', allowNull: false, defaultValue: 'BOB' })
  declare currencyCode: string;

  @Column({ type: DataType.UUID, field: 'accounting_document_id', allowNull: true })
  declare accountingDocumentId: string | null;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false })
  declare status: string;
}
